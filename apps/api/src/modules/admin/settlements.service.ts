import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SQL, and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { settlements } from '../../database/schema';
import { whitelistedOrderBy } from '../../common/utils/sort';
import { riyadhDateString, addDaysToDateString } from '../../common/utils/riyadh-date';
import { buildSettlementRevenueQuery } from '../partner/settlement-revenue';
import { ListSettlementsDto } from './dto/list-settlements.dto';
import { AuditService } from './audit.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { RealtimeService } from '../gateway/realtime.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { reportFanOutError } from '../../common/utils/fanout';

type DB = PostgresJsDatabase<typeof schema>;

/**
 * Normalize a Postgres numeric(12,2) aggregate (returned as an exact decimal
 * STRING) to a 2dp decimal string WITHOUT routing the value through a float.
 * P2-4 (run #41): generatePending previously did SUM(...)::float then
 * Math.round(x*100)/100 — a float sat in the path that decides venue payout
 * amounts. Numeric SUM at scale 2 is already exact 2dp, so this degenerates to
 * a normalize-guard; the Number() fallback only fires for malformed shapes
 * (defensive, unreachable for numeric(12,2) SUM output).
 */
function quantizeMoney2dp(raw: string | number | null | undefined): string {
  if (typeof raw === 'string' && /^-?\d+\.\d{2}$/.test(raw)) return raw;
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

@Injectable()
export class AdminSettlementsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly settings: PlatformSettingsService,
    private readonly realtime: RealtimeService,
    private readonly activities: ActivitiesService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(dto: ListSettlementsDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where: SQL | undefined = dto.status
      ? sql`WHERE s.status = ${dto.status}`
      : undefined;

    const rows = (await this.db.execute(sql`
      SELECT
        s.id, s.venue_id, s.amount::text AS amount,
        s.period_start, s.period_end, s.status, s.payout_ref, s.paid_at, s.created_at,
        -- P2-250 (run #160, Reviewer A #159): surface payout-request
        -- provenance so admins can distinguish partner-requested rows from
        -- auto-generated ones (P2-C read-model, partner console half shipped
        -- in PR #148; this is the admin half).
        s.requested_by, u.full_name AS requested_by_name,
        v.name AS venue_name
      FROM settlements s
      INNER JOIN venues v ON v.id = s.venue_id
      LEFT JOIN users u ON u.id = s.requested_by
      ${where}
      ORDER BY ${whitelistedOrderBy(
        dto.sortBy,
        dto.dir,
        { created_at: sql`s.created_at`, amount: sql`s.amount` },
        sql`s.created_at`,
        'desc',
      )}
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c FROM settlements s ${where}
    `)) as unknown as Array<{ c: number }>;

    return { settlements: rows, total: countRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    const settlement = await this.db.query.settlements.findFirst({
      where: eq(settlements.id, id),
      with: { venue: { columns: { id: true, name: true, city: true } } },
    });

    if (!settlement) {
      throw new NotFoundException('Settlement not found.');
    }
    return settlement;
  }

  async pay(id: string, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    if (before.status !== 'pending') {
      throw new BadRequestException('Only pending settlements can be paid.');
    }

    const payoutRef = `PO-${id.slice(0, 8).toUpperCase()}`;

    // Conditional update — only `pending` rows flip to `paid`. A concurrent pay
    // that already flipped the row matches zero rows here, closing the TOCTOU
    // race (the read above + this write cannot double-pay).
    const updated = await this.db
      .update(settlements)
      .set({ status: 'paid', payout_ref: payoutRef, paid_at: new Date() })
      .where(and(eq(settlements.id, id), eq(settlements.status, 'pending')))
      .returning({ id: settlements.id });

    if (updated.length === 0) {
      throw new BadRequestException('Only pending settlements can be paid.');
    }

    const after = await this.findOne(id);
    await this.audit.log({
      adminId,
      action: 'settlement.pay',
      entityType: 'settlement',
      entityId: id,
      before,
      after,
      ip,
    });
    this.realtime.broadcastOps('settlements');

    // P1-67 (run #141): tell the venue partner their money moved. The guard
    // above guarantees `status: 'paid'` — notify AFTER the write + audit so a
    // notification is never emitted for a pay that didn't happen (TOCTOU-safe
    // ordering). Best-effort: a resolve/fan-out failure is logged + Sentry'd
    // (reportFanOutError) and NEVER throws into the admin's pay() — a paid
    // settlement must not 500 because a push didn't land.
    try {
      const [target] = (await this.db.execute(sql`
        SELECT v.owner_id,
               v.name AS venue_name,
               s.amount::text AS amount
        FROM settlements s
        INNER JOIN venues v ON v.id = s.venue_id
        WHERE s.id = ${id}
      `)) as unknown as Array<{
        owner_id: string;
        venue_name: string | null;
        amount: string;
      }>;

      if (target?.owner_id) {
        await this.activities.record({
          actorId: adminId,
          verb: 'payout_paid',
          subjectId: id,
          recipients: [target.owner_id],
          excludeActor: false,
        });
        await this.notifications.sendPushToUsers([target.owner_id], {
          key: 'payout_paid', // P2-8: text localized per subscription locale
          vars: { venueName: target.venue_name ?? undefined, amount: target.amount },
          data: { type: 'payout-paid' },
        });
      }
    } catch (err) {
      reportFanOutError('settlements.pay-notify', err);
    }

    return after;
  }

  /**
   * Generates a `pending` settlement per venue for completed KoraLink-booked
   * matches within the configured payout cadence window. Venues already
   * settled for the window are skipped (no double-payout).
   *
   * P2-216 (run #163): the revenue SELECT moved INSIDE the transaction and
   * the venue rows are locked (ORDER BY id FOR UPDATE) before it runs — the
   * old flow read the unsettled set on the pooled db OUTSIDE the tx, so a
   * partner payout request committing between the SELECT and the INSERTs
   * slipped past the dedupe guard (check-vs-insert TOCTOU against the very
   * path it must serialize with). Both paths now share ONE money-source
   * query (modules/partner/settlement-revenue.ts) and one lock order.
   */
  async generatePending(adminId: string, ip?: string, venueId?: string) {
    // P2-284 (run #179): optional single-venue scope. The scoped run locks and
    // settles ONE venue so an off batch member can be settled/re-run without
    // touching (or being blocked by) the rest. Unknown or pitch-less venues
    // 404 BEFORE any tx opens. The revenue query receives the explicit id —
    // the empty list (all-venues default) semantics are unchanged.
    if (venueId !== undefined) {
      const [venue] = (await this.db.execute(sql`
        SELECT v.id
        FROM venues v
        INNER JOIN pitches p ON p.venue_id = v.id
        WHERE v.id = ${venueId}
        LIMIT 1
      `)) as unknown as Array<{ id: string }>;
      if (!venue) throw new NotFoundException('venue not found or has no pitches');
    }

    const cadenceDays = await this.settings.getNumber('payout_cadence_days', 7);
    const riyadhEnd = riyadhDateString();
    const startDay = addDaysToDateString(riyadhEnd, -cadenceDays);

    const inserted = await this.db.transaction(async (tx) => {
      // Lock the scope's venue rows up-front, in a deterministic order — the
      // same lock the partner requestPayout tx takes first, so a concurrent
      // request/generate waits here instead of racing the guard. JOIN-free
      // IN(subquery) keeps FOR UPDATE legal (no outer-join partition) and
      // locks ONLY the venue rows (not pitches/matches).
      await tx.execute(
        venueId !== undefined
          ? sql`SELECT id FROM venues WHERE id = ${venueId} ORDER BY id FOR UPDATE`
          : sql`
        SELECT id FROM venues
        WHERE id IN (SELECT venue_id FROM pitches)
        ORDER BY id
        FOR UPDATE
      `,
      );

      const rows = (await tx.execute(
        buildSettlementRevenueQuery({
          venueIds: venueId !== undefined ? [venueId] : [],
          cadenceDays,
          riyadhEnd,
        }),
      )) as unknown as Array<{ venue_id: string; amount: string }>;

      const out: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        // P2-4: row.amount arrives as Postgres' EXACT decimal string (numeric
        // SUM); it is quantized as a string and never routed through a float.
        const amount = quantizeMoney2dp(row.amount);
        if (Number(amount) <= 0) continue;
        const [settlement] = await tx
          .insert(settlements)
          .values({
            venue_id: row.venue_id,
            amount,
            period_start: startDay,
            period_end: riyadhEnd,
            status: 'pending',
          })
          .onConflictDoNothing()
          .returning();
        if (settlement) out.push(settlement);
      }
      return out;
    });

    for (const settlement of inserted) {
      await this.audit.log({
        adminId,
        action: 'settlement.generate',
        entityType: 'settlement',
        entityId: settlement.id as string,
        before: undefined,
        after: settlement,
        ip,
      });
    }
    this.realtime.broadcastOps('settlements');

    return { generated: inserted.length, settlements: inserted };
  }
}
