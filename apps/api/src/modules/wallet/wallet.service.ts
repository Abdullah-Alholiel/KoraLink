import {
  Injectable,
  BadRequestException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import {
  users,
  transactions,
  TransactionType,
  ReferenceType,
} from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';

export interface LedgerEntryDto {
  type: TransactionType;
  amount: number;
  referenceType: ReferenceType;
  referenceId?: string;
  idempotencyKey: string;
}

/** Response shape for an idempotent replay (key already used). */
export interface ReplayResult {
  replayed: true;
  ledgerEntry: unknown;
  wallet_balance: string;
}

type DB = PostgresJsDatabase<typeof schema>;

/**
 * Structural guard for a PostgreSQL unique-constraint violation (SQLSTATE
 * 23505). Works for both the `postgres` (postgres.js) driver error shape
 * ({ code, constraint }) and db-errors-style wrappers ({ constraint } only),
 * without importing a driver-specific error class.
 */
export function isUniqueViolation(
  err: unknown,
  constraint: string,
): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; constraint?: unknown };
  return e.code === '23505' && e.constraint === constraint;
}

@Injectable()
export class WalletService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  /**
   * Fetches the original ledger entry for an idempotent replay. Shared by
   * the pre-check path and the unique-violation race path.
   */
  private async findReplay(
    userId: string,
    idempotencyKey: string,
  ): Promise<ReplayResult | null> {
    const [existing] = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.idempotency_key, idempotencyKey),
          eq(transactions.user_id, userId),
        ),
      )
      .limit(1);

    if (!existing) return null;
    const [user] = await this.db
      .select({ wallet_balance: users.wallet_balance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      replayed: true,
      ledgerEntry: existing,
      wallet_balance: user?.wallet_balance ?? '0',
    };
  }

  /**
   * Creates an immutable ledger entry and updates the user's wallet balance
   * atomically using a Drizzle transaction.
   *
   * Idempotent replays: a retried request (e.g. a payment-gateway webhook
   * redelivery) with an already-used `idempotency_key` returns the ORIGINAL
   * ledger entry (Stripe-style) instead of a 409. This covers both the
   * sequential pre-check and the concurrent unique-violation race (the
   * loser of the race re-selects outside the aborted transaction, so its
   * replay can never dead-loop on the same tx).
   */
  async recordTransaction(userId: string, entry: LedgerEntryDto) {
    const { type, amount, referenceType, referenceId, idempotencyKey } = entry;

    if (amount <= 0) {
      throw new BadRequestException('Transaction amount must be positive.');
    }

    // Sequential replay: key already used → return the original entry.
    const prior = await this.findReplay(userId, idempotencyKey);
    if (prior) return prior;

    // Idempotency check and insert are now inside the SAME transaction
    // to eliminate the TOCTOU race condition.
    try {
      return await this.db.transaction(async (tx) => {
        // 1. Create the immutable ledger entry.
        const [ledgerEntry] = await tx
          .insert(transactions)
          .values({
            user_id: userId,
            type,
            amount: amount.toString(),
            reference_type: referenceType,
            reference_id: referenceId,
            idempotency_key: idempotencyKey,
            status: 'Completed',
          })
          .returning();

        // 2. Update the wallet balance — increment for CREDIT, decrement for DEBIT.
        const balanceDelta = type === 'CREDIT' ? amount : -amount;

        const [updatedUser] = await tx
          .update(users)
          .set(withTimestamp({ wallet_balance: sql`${users.wallet_balance} + ${balanceDelta}` }))
          .where(eq(users.id, userId))
          .returning({ id: users.id, wallet_balance: users.wallet_balance });

        // 3. Guard against negative balance on DEBIT.
        if (parseFloat(updatedUser.wallet_balance) < 0) {
          throw new BadRequestException('Insufficient wallet balance.');
        }

        return { ledgerEntry, wallet_balance: updatedUser.wallet_balance };
      });
    } catch (err) {
      // Concurrent replay (webhook double-fire): both requests pass the
      // pre-check, the loser hits the idempotency_key unique constraint and
      // its tx is rolled back. Re-select OUTSIDE the aborted transaction and
      // return the original entry — no 500, no balance double-write.
      if (
        isUniqueViolation(err, 'transactions_idempotency_key_unique')
      ) {
        const replay = await this.findReplay(userId, idempotencyKey);
        if (replay) return replay;
      }
      throw err;
    }
  }

  async getBalance(userId: string): Promise<string> {
    const [user] = await this.db
      .select({ wallet_balance: users.wallet_balance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user.wallet_balance;
  }

  async getHistory(userId: string, page = 1, perPage = 20) {
    const skip = (page - 1) * perPage;
    const [transactionsData, totalResult] = await Promise.all([
      this.db
        .select()
        .from(transactions)
        .where(eq(transactions.user_id, userId))
        .orderBy(desc(transactions.created_at))
        .offset(skip)
        .limit(perPage),
      this.db
        .select({ total: count() })
        .from(transactions)
        .where(eq(transactions.user_id, userId)),
    ]);

    const total = totalResult[0]?.total ?? 0;
    const hasMore = skip + perPage < total;

    return { transactions: transactionsData, total, hasMore };
  }
}
