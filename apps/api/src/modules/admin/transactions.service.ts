import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SQL, and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import * as schema from '../../database/schema';
import { transactions, users } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminTransactionsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(dto: ListTransactionsDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const conds: SQL[] = [];
    if (dto.status) conds.push(sql`t.status = ${dto.status}`);
    if (dto.type) conds.push(sql`t.type = ${dto.type}`);
    const where = conds.length ? sql`WHERE ${and(...conds)}` : sql``;

    const rows = (await this.db.execute(sql`
      SELECT
        t.id, t.user_id, t.type, t.amount::float AS amount,
        t.reference_type, t.reference_id, t.status, t.created_at,
        u.full_name AS user_name, u.phone AS user_phone
      FROM transactions t
      INNER JOIN users u ON u.id = t.user_id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c FROM transactions t
      ${where}
    `)) as unknown as Array<{ c: number }>;

    return { transactions: rows, total: countRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    const tx = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, id),
      with: { user: { columns: { id: true, full_name: true, phone: true } } },
    });

    if (!tx) {
      throw new NotFoundException('Transaction not found.');
    }
    return tx;
  }

  async refund(id: string, adminId: string, ip?: string) {
    const original = await this.findOne(id);

    if (original.type !== 'DEBIT' || original.status !== 'Completed') {
      throw new BadRequestException('Only completed debit transactions can be refunded.');
    }

    const refundId = randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(transactions).values({
        id: refundId,
        user_id: original.user_id,
        type: 'CREDIT',
        amount: original.amount,
        reference_type: 'REFUND',
        reference_id: original.id,
        idempotency_key: `refund-${original.id}`,
        status: 'Completed',
      });

      await tx
        .update(transactions)
        .set({ status: 'Reversed' })
        .where(eq(transactions.id, id));

      await tx
        .update(users)
        .set(withTimestamp({ wallet_balance: sql`${users.wallet_balance} + ${original.amount}` }))
        .where(eq(users.id, original.user_id));
    });

    const after = await this.findOne(refundId);
    await this.audit.log({
      adminId,
      action: 'transaction.refund',
      entityType: 'transaction',
      entityId: id,
      before: original,
      after,
      ip,
    });
    this.realtime.broadcastOps('transactions');

    return after;
  }
}
