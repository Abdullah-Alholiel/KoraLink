import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SQL, and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { venues, venue_verifications, users } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListVenuesDto } from './dto/list-venues.dto';
import { VenueDecisionDto } from './dto/venue-decision.dto';
import { TransferVenueDto } from './dto/transfer-venue.dto';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { ActivitiesService } from '../activities/activities.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminVenuesService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly activities: ActivitiesService,
  ) {}

  private buildWhere(dto: ListVenuesDto): SQL {
    const conds: SQL[] = [];

    if (dto.search) {
      const q = `%${dto.search.trim()}%`;
      conds.push(sql`(v.name ILIKE ${q} OR v.city ILIKE ${q} OR u.full_name ILIKE ${q})`);
    }
    if (dto.city) {
      conds.push(sql`v.city ILIKE ${'%' + dto.city + '%'}`);
    }
    if (dto.status === 'approved') {
      conds.push(sql`v.is_approved = true`);
    } else if (dto.status === 'pending') {
      conds.push(sql`v.is_approved = false AND COALESCE(vv.status::text, 'pending') = 'pending'`);
    } else if (dto.status === 'rejected') {
      conds.push(sql`COALESCE(vv.status::text, 'pending') = 'rejected'`);
    }

    return conds.length ? sql`WHERE ${and(...conds)}` : sql``;
  }

  async list(dto: ListVenuesDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where = this.buildWhere(dto);

    const rows = (await this.db.execute(sql`
      SELECT
        v.id, v.name, v.city, v.address, v.is_approved, v.is_koralink_partner,
        v.rating, v.created_at,
        u.id AS owner_id, u.full_name AS owner_name,
        COUNT(p.id)::int AS pitch_count,
        COALESCE(vv.status::text, 'pending') AS verification_status
      FROM venues v
      INNER JOIN users u ON u.id = v.owner_id
      LEFT JOIN pitches p ON p.venue_id = v.id
      LEFT JOIN venue_verifications vv ON vv.venue_id = v.id
      ${where}
      GROUP BY v.id, u.id, vv.status
      ORDER BY v.created_at DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(DISTINCT v.id)::int AS c
      FROM venues v
      INNER JOIN users u ON u.id = v.owner_id
      LEFT JOIN venue_verifications vv ON vv.venue_id = v.id
      ${where}
    `)) as unknown as Array<{ c: number }>;

    return { venues: rows, total: countRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    const venue = await this.db.query.venues.findFirst({
      where: eq(venues.id, id),
      with: {
        owner: { columns: { id: true, full_name: true, handle: true, phone: true, avatar_url: true } },
        pitches: true,
      },
    });

    if (!venue) {
      throw new NotFoundException('Venue not found.');
    }

    const verification = await this.db.query.venue_verifications.findFirst({
      where: eq(venue_verifications.venue_id, id),
    });

    return { ...venue, verification: verification ?? null };
  }

  async getVerification(id: string) {
    const verification = await this.db.query.venue_verifications.findFirst({
      where: eq(venue_verifications.venue_id, id),
    });
    if (!verification) {
      throw new NotFoundException('No verification submission for this venue.');
    }
    return verification;
  }

  async decide(id: string, dto: VenueDecisionDto, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    await this.db.transaction(async (tx) => {
      await tx
        .update(venues)
        .set({ is_approved: dto.decision === 'approve', updated_at: new Date() })
        .where(eq(venues.id, id));

      await tx
        .update(venue_verifications)
        .set({
          status: dto.decision === 'approve' ? 'approved' : 'rejected',
          reviewed_by: adminId,
          reviewed_at: new Date(),
        })
        .where(eq(venue_verifications.venue_id, id));
    });

    const after = await this.findOne(id);
    await this.audit.log({
      adminId,
      action: `venue.${dto.decision}`,
      entityType: 'venue',
      entityId: id,
      before,
      after: { ...after, note: dto.note ?? null },
      ip,
    });
    this.realtime.broadcastOps('venues');

    return after;
  }

  /**
   * Ownership transfer (admin-ux-overhaul slice 4) — the "external request"
   * case: HQ reassigns a venue (and therefore its pitches — ownership flows
   * through venues.owner_id) to a new VenueOwner.
   *
   * Immediate hard transfer per Abdullah's approved semantics: audited,
   * both owners notified, no acceptance round-trip.
   */
  async transferOwnership(id: string, dto: TransferVenueDto, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    const beforeOwnerId = before.owner_id as string | null;
    if (beforeOwnerId === dto.newOwnerId) {
      throw new BadRequestException('That user already owns this venue.');
    }

    const [target] = await this.db
      .select({ id: users.id, role: users.role, full_name: users.full_name, phone: users.phone })
      .from(users)
      .where(eq(users.id, dto.newOwnerId))
      .limit(1);
    if (!target) {
      throw new NotFoundException('Target user not found.');
    }
    if (target.role !== 'VenueOwner') {
      throw new BadRequestException('Target user is not a venue owner.');
    }

    await this.db
      .update(venues)
      .set(withTimestamp({ owner_id: dto.newOwnerId }))
      .where(eq(venues.id, id));

    const after = await this.findOne(id);
    await this.audit.log({
      adminId,
      action: 'venue.transfer_ownership',
      entityType: 'venue',
      entityId: id,
      before,
      after,
      ip,
    });
    this.realtime.broadcastOps('venues');

    // Notify both owners (best-effort — a notification failure must never
    // fail the transfer). subjectId carries the venue for the feed link.
    try {
      if (beforeOwnerId) {
        await this.activities.record({
          actorId: adminId,
          verb: 'venue_ownership_removed',
          subjectId: id,
          recipients: [beforeOwnerId],
          excludeActor: false,
        });
      }
      await this.activities.record({
        actorId: adminId,
        verb: 'venue_ownership_added',
        subjectId: id,
        recipients: [dto.newOwnerId],
        excludeActor: false,
      });
    } catch {
      // swallow — feed/WS fan-out is supplementary
    }

    return after;
  }
}
