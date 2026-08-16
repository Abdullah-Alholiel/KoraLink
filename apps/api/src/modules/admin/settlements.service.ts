import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SQL, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { settlements } from '../../database/schema';
import { ListSettlementsDto } from './dto/list-settlements.dto';
import { AuditService } from './audit.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminSettlementsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
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

    await this.db
      .update(settlements)
      .set({ status: 'paid', payout_ref: payoutRef, paid_at: new Date() })
      .where(eq(settlements.id, id));

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

    return after;
  }
}
