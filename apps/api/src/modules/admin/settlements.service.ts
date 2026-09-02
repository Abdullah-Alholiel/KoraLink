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
import { ListSettlementsDto } from './dto/list-settlements.dto';
import { AuditService } from './audit.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { RealtimeService } from '../gateway/realtime.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminSettlementsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly settings: PlatformSettingsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(dto: ListSettlementsDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where: SQL | undefined = dto.status
      ? sql`WHERE s.status = ${dto.status}`
      : undefined;

    const rows = (await this.db.execute(sql`
      SELECT
        s.id, s.venue_id, s.amount::float AS amount,
        s.period_start, s.period_end, s.status, s.payout_ref, s.paid_at, s.created_at,
        v.name AS venue_name
      FROM settlements s
      INNER JOIN venues v ON v.id = s.venue_id
      ${where}
      ORDER BY s.created_at DESC
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

    return after;
  }

  /**
   * Generates a `pending` settlement per venue for completed KoraLink-booked
   * matches within the configured payout cadence window. Venues already
   * settled for the window are skipped (no double-payout).
   */
  async generatePending(adminId: string, ip?: string) {
    const cadenceDays = await this.settings.getNumber('payout_cadence_days', 7);
    const windowStart = new Date(Date.now() - cadenceDays * 24 * 60 * 60 * 1000);
    const windowStartIso = windowStart.toISOString();

    const rows = (await this.db.execute(sql`
      SELECT
        v.id AS venue_id,
        COALESCE(SUM(m.pitch_cost_sar), 0)::float AS amount
      FROM matches m
      INNER JOIN pitches p ON p.id = m.pitch_id
      INNER JOIN venues v ON v.id = p.venue_id
      WHERE m.status = 'Completed'
        AND m.booking_mode = 'koralink'
        AND m.scheduled_at >= ${windowStartIso}
        AND NOT EXISTS (
          SELECT 1 FROM settlements s
          WHERE s.venue_id = v.id AND s.period_start >= ${windowStartIso}::date
        )
      GROUP BY v.id
      HAVING COALESCE(SUM(m.pitch_cost_sar), 0) > 0
    `)) as unknown as Array<{ venue_id: string; amount: number }>;

    const created: Array<Record<string, unknown>> = [];
    // Insert inside a transaction and rely on the `(venue_id, period_start)`
    // unique index via `onConflictDoNothing` — concurrent generatePending runs
    // (or a re-run for an already-settled window) can no longer double-insert.
    const inserted = await this.db.transaction(async (tx) => {
      const out: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        const amount = Math.round(row.amount * 100) / 100;
        if (amount <= 0) continue;
        const [settlement] = await tx
          .insert(settlements)
          .values({
            venue_id: row.venue_id,
            amount: amount.toFixed(2),
            period_start: windowStartIso.slice(0, 10),
            period_end: new Date().toISOString().slice(0, 10),
            status: 'pending',
          })
          .onConflictDoNothing()
          .returning();
        if (settlement) out.push(settlement);
      }
      return out;
    });

    for (const settlement of inserted) {
      created.push(settlement);
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

    return { generated: created.length, settlements: created };
  }
}
