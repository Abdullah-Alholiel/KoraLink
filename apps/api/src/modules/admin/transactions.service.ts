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
import { ActivitiesService } from '../activities/activities.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminTransactionsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly activities: ActivitiesService,
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
      // Lock the ORIGINAL debit row FOR UPDATE, then re-assert its status
      // INSIDE the tx — the pre-check above runs outside any lock, so two
      // concurrent refunds of the same debit could both pass it (Reviewer A,
      // run #22). The loser now gets a 400 instead of a raw unique-violation
      // 500 (or a double credit if the refund-<id> idempotency key were ever
      // dropped). Same pattern as cancelMatch (run #20).
      const locked = (await tx
        .execute(
          sql`SELECT id, status FROM transactions WHERE id = ${id}::text FOR UPDATE`,
        )
        .then(
          (r: unknown) => (r as { rows?: unknown[] }).rows ?? r,
        )) as Array<{ id: string; status: string }>;

      if (!locked[0] || locked[0].status !== 'Completed') {
        throw new BadRequestException(
          'Only completed debit transactions can be refunded.',
        );
      }

      // Idempotent insert: a concurrent winner already claimed refund-<id> →
      // zero rows back → abort with zero side effects (rollback is a no-op —
      // nothing was inserted or updated on this path).
      const inserted = await tx
        .insert(transactions)
        .values({
          id: refundId,
          user_id: original.user_id,
          type: 'CREDIT',
          amount: original.amount,
          reference_type: 'REFUND',
          reference_id: original.id,
          idempotency_key: `refund-${original.id}`,
          status: 'Completed',
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id });

      if (inserted.length === 0) {
        throw new BadRequestException(
          'This transaction is already being refunded.',
        );
      }

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

    // ── Player notification: their money came back ──
    try {
      await this.activities.record({
        actorId: adminId,
        verb: 'wallet_refunded',
        recipients: [original.user_id],
        excludeActor: false,
      });
    } catch {
      // best-effort
    }

    return after;
  }
}
