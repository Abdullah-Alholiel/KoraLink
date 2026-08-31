import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListMatchesDto } from './dto/list-matches.dto';
import { UpdateMatchAdminDto } from './dto/update-match-admin.dto';
import { AuditService } from './audit.service';
import { MatchesService } from '../matches/matches.service';
import { RealtimeService } from '../gateway/realtime.service';
import { ActivitiesService } from '../activities/activities.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminMatchesService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly matchesService: MatchesService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly activities: ActivitiesService,
  ) {}

  async list(dto: ListMatchesDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where = dto.status ? sql`WHERE m.status = ${dto.status}` : sql``;

    const rows = (await this.db.execute(sql`
      SELECT
        m.id, m.title, m.status, m.match_type, m.gender_rule,
        m.scheduled_at, m.duration_mins,
        m.price_per_player::float AS price_per_player,
        m.max_players, m.booking_mode, m.created_at,
        p.name AS pitch_name,
        v.name AS venue_name,
        host.full_name AS host_name,
        COUNT(mp.id)::int AS spots_filled
      FROM matches m
      INNER JOIN pitches p ON p.id = m.pitch_id
      INNER JOIN venues v ON v.id = p.venue_id
      INNER JOIN users host ON host.id = m.host_id
      LEFT JOIN match_players mp ON mp.match_id = m.id
      ${where}
      GROUP BY m.id, p.id, v.id, host.id
      ORDER BY m.scheduled_at DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c FROM matches m ${where}
    `)) as unknown as Array<{ c: number }>;

    return { matches: rows, total: countRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    return this.matchesService.findOne(id);
  }

  /**
   * Admin-initiated match cancellation. Reuses the full host-cancel path
   * (slot release + pitch-cost refund) by invoking it on behalf of the host.
   */
  async cancel(id: string, adminId: string, ip?: string) {
    const [match] = await this.db
      .select({ id: matches.id, host_id: matches.host_id, status: matches.status })
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1);

    if (!match) {
      throw new NotFoundException('Match not found.');
    }

    const after = await this.matchesService.cancelMatch(match.host_id, id);

    await this.audit.log({
      adminId,
      action: 'match.cancel',
      entityType: 'match',
      entityId: id,
      before: match,
      after,
      ip,
    });
    this.realtime.broadcastOps('matches');

    // ── Roster notification: HQ cancelled the match, refunds issued ──
    try {
      const roster = await this.db
        .select({ user_id: schema.match_players.user_id })
        .from(schema.match_players)
        .where(eq(schema.match_players.match_id, id));
      if (roster.length) {
        await this.activities.record({
          actorId: adminId,
          verb: 'match_cancelled_admin',
          matchId: id,
          recipients: roster.map((r) => r.user_id),
          excludeActor: false,
        });
      }
    } catch {
      // best-effort
    }

    return after;
  }

  /**
   * Admin match edit (admin-ux-overhaul slice 3).
   *
   * Metadata (title/match_type/gender_rule) is editable for any Open or
   * InProgress match. Schedule fields (scheduled_at/duration_mins) are
   * editable ONLY for self-booked matches (no pitch slot): koralink-booked
   * matches keep their booking_slot_id as the schedule source of truth, so
   * moving their clock goes through the host reschedule flow (slot locks +
   * money re-derivation). No wallet/ledger operations happen here.
   */
  async update(id: string, dto: UpdateMatchAdminDto, adminId: string, ip?: string) {
    const [row] = await this.db
      .select({
        id: matches.id,
        status: matches.status,
        booking_mode: matches.booking_mode,
        pitch_id: matches.pitch_id,
        scheduled_at: matches.scheduled_at,
        duration_mins: matches.duration_mins,
      })
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Match not found.');
    }
    if (row.status !== 'Open' && row.status !== 'InProgress') {
      throw new BadRequestException('Only Open or InProgress matches can be edited.');
    }

    const scheduleChange = dto.scheduled_at !== undefined || dto.duration_mins !== undefined;
    if (scheduleChange && row.booking_mode !== 'self') {
      throw new BadRequestException(
        'Schedule changes for koralink-booked matches go through the host reschedule flow.',
      );
    }

    const updates: Record<string, unknown> = {};
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.match_type !== undefined) updates.match_type = dto.match_type;
    if (dto.gender_rule !== undefined) updates.gender_rule = dto.gender_rule;
    if (dto.scheduled_at !== undefined) {
      const newStart = new Date(dto.scheduled_at);
      if (Number.isNaN(newStart.getTime()) || newStart.getTime() <= Date.now()) {
        throw new BadRequestException('Scheduled time must be in the future.');
      }
      updates.scheduled_at = newStart;
    }
    if (dto.duration_mins !== undefined) updates.duration_mins = dto.duration_mins;

    if (!Object.keys(updates).length) {
      throw new BadRequestException('No changes provided.');
    }

    // ── Same-pitch overlap guard (self-mode schedule changes only) ──────
    if (scheduleChange) {
      const newStart =
        (updates.scheduled_at as Date | undefined) ??
        (row.scheduled_at ? new Date(row.scheduled_at) : new Date());
      const newDur = (updates.duration_mins as number | undefined) ?? row.duration_mins ?? 60;
      const newEnd = new Date(newStart.getTime() + newDur * 60_000);
      const overlaps = (await this.db.execute(sql`
        SELECT COUNT(*)::int AS c
        FROM matches m2
        WHERE m2.pitch_id::text = ${row.pitch_id}
          AND m2.id::text <> ${id}
          AND m2.status IN ('Open', 'Full', 'InProgress')
          AND m2.scheduled_at < ${newEnd.toISOString()}
          AND (m2.scheduled_at + (m2.duration_mins * interval '1 minute')) > ${newStart.toISOString()}
      `)) as unknown as Array<{ c: number }>;
      if ((overlaps[0]?.c ?? 0) > 0) {
        throw new BadRequestException(
          'Another match is already scheduled in this window on the same pitch.',
        );
      }
    }

    const before = await this.findOne(id);
    await this.db
      .update(matches)
      .set(withTimestamp(updates) as never)
      .where(eq(matches.id, id));
    const after = await this.findOne(id);

    await this.audit.log({
      adminId,
      action: 'match.update',
      entityType: 'match',
      entityId: id,
      before,
      after,
      ip,
    });
    this.realtime.broadcastOps('matches');

    return after;
  }
}
