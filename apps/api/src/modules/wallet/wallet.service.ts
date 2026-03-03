import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { eq, desc, sql } from 'drizzle-orm';
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

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class WalletService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  /**
   * Creates an immutable ledger entry and updates the user's wallet balance
   * atomically using a Drizzle transaction.
   *
   * The `idempotency_key` unique constraint ensures that retried requests
   * (e.g. from a payment gateway webhook) cannot double-charge the user.
   */
  async recordTransaction(userId: string, entry: LedgerEntryDto) {
    const { type, amount, referenceType, referenceId, idempotencyKey } = entry;

    if (amount <= 0) {
      throw new BadRequestException('Transaction amount must be positive.');
    }

    // Check for duplicate idempotency key before entering the transaction.
    const [existing] = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.idempotency_key, idempotencyKey))
      .limit(1);

    if (existing) {
      throw new ConflictException('Duplicate transaction: idempotency key already used.');
    }

    return this.db.transaction(async (tx) => {
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
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.user_id, userId))
      .orderBy(desc(transactions.created_at))
      .offset(skip)
      .limit(perPage);
  }
}
