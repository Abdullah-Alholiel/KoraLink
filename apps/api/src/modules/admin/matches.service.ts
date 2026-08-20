import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches } from '../../database/schema';
import { ListMatchesDto } from './dto/list-matches.dto';
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
}
