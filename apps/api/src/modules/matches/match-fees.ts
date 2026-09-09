import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { transactions, users } from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withTimestamp } from '../../common/utils/timestamp';

type DB = PostgresJsDatabase<typeof schema>;
/** Tx handle carried into module-level tx helpers (shares the caller's transaction). */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * Player-host responsibility (slices 2 & 4): shared money primitives that run
 * inside the CALLER's transaction — never a nested transaction of their own —
 * so seat/charge/refund/credit commit or roll back together.
 *
 * Both mirror WalletService.recordTransaction exactly (ledger row → balance
 * write → guarded numeric), with join/refund-specific replay semantics.
 */

/**
 * Charge a match fee as a MATCH_FEE DEBIT inside the caller's tx.
 *
 * Replay detection is a pre-check on (idempotency_key, user_id): the fee key
 * is per-EPISODE, so a sequential retry (client timeout after commit) lands
 * here with the seat already present and must NOT re-charge. A concurrent
 * same-key unique-violation aborts this tx — surfaced as 409 so the client
 * retry resolves through the replay path.
 *
 * @returns the ledger row id, or the literal 'REPLAYED' for a sequential retry.
 */
export async function chargeMatchFeeTx(
  tx: Tx,
  userId: string,
  matchId: string,
  amountSar: number,
  idempotencyKey: string,
): Promise<string | 'REPLAYED'> {
  if (!(amountSar > 0)) {
    throw new BadRequestException('Fee amount must be positive.');
  }

  // Sequential replay: this episode's fee was already charged.
  const [prior] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.idempotency_key, idempotencyKey),
        eq(transactions.user_id, userId),
      ),
    )
    .limit(1);
  if (prior) return 'REPLAYED';

  try {
    // 1. Immutable ledger entry (matches MATCH_FEE convention in wallet.service).
    const [ledgerEntry] = await tx
      .insert(transactions)
      .values({
        user_id: userId,
        type: 'DEBIT',
        amount: amountSar.toFixed(2),
        reference_type: 'MATCH_FEE',
        reference_id: matchId,
        idempotency_key: idempotencyKey,
        status: 'Completed',
      })
      .returning({ id: transactions.id });

    // 2. Balance write — guarded numeric (no negative balances).
    const [updatedUser] = await tx
      .update(users)
      .set(
        withTimestamp({
          wallet_balance: sql`${users.wallet_balance} - ${amountSar}`,
        }),
      )
      .where(eq(users.id, userId))
      .returning({ wallet_balance: users.wallet_balance });

    if (parseFloat(updatedUser.wallet_balance) < 0) {
      // Rolls back the ENTIRE join tx: no seat without payment.
      throw new BadRequestException('Insufficient wallet balance.');
    }

    return ledgerEntry.id;
  } catch (err) {
    // Lost a concurrent same-key race: this tx is aborted by Postgres —
    // surface 409; the client retry resolves via the replay pre-check.
    if (
      err &&
      typeof err === 'object' &&
      (err as { code?: unknown }).code === '23505'
    ) {
      throw new ConflictException('Concurrent join detected — retry.');
    }
    throw err;
  }
}

/**
 * Credit a wallet inside the caller's tx (refunds, forfeit credits, payouts).
 * CREDIT ledger row + guarded balance increment, mirroring wallet.service.
 */
export async function creditWalletTx(
  tx: Tx,
  userId: string,
  amountSar: number,
  idempotencyKey: string,
  referenceType: (typeof transactions.$inferInsert)['reference_type'],
  referenceId: string | null,
): Promise<void> {
  if (!(amountSar > 0)) return; // nothing to credit (defensive: free rows)

  await tx.insert(transactions).values({
    user_id: userId,
    type: 'CREDIT',
    amount: amountSar.toFixed(2),
    reference_type: referenceType,
    reference_id: referenceId,
    idempotency_key: idempotencyKey,
    status: 'Completed',
  });

  await tx
    .update(users)
    .set(
      withTimestamp({
        wallet_balance: sql`${users.wallet_balance} + ${amountSar}`,
      }),
    )
    .where(eq(users.id, userId));
}
