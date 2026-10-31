import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { creditWalletTx } from './match-fees';

/**
 * creditWalletTx guard contract (run #157 — reviewer A IMPORTANT fix).
 *
 * The credit side of the money engine previously wrote the ledger row + an
 * UNGUARDED balance UPDATE: a vanished user row committed a CREDIT ledger
 * entry with zero balance movement (silent ledger/balance divergence), and a
 * concurrent same-key caller aborted on UNIQUE(idempotency_key) with a raw
 * 23505 → 500 instead of an idempotent replay. These specs pin the mirror of
 * chargeMatchFeeTx / wallet.service.recordTransaction semantics:
 *
 *   1. happy path      → ledger insert + balance update both fire
 *   2. sequential replay (prior key) → NO writes (idempotent no-op)
 *   3. vanished user row → clean 400, caller tx rolls back (no partial credit)
 *   4. concurrent same-key race (23505) → clean 409 (retry resolves via replay)
 */

/** Minimal thenable-chain tx mock (mirrors matches.refund-matrix.spec.ts). */
function makeTx(opts: {
  priorRows?: { id: string }[];
  updatedRows?: { wallet_balance: string }[];
  insertError?: { code: string };
}) {
  const calls: string[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            then: (res: (v: unknown) => void) => res(opts.priorRows ?? []),
          }),
        }),
      }),
    }),
    insert: () => ({
      values: () => {
        calls.push('insert');
        if (opts.insertError) {
          return {
            then: (_res: unknown, rej: (e: unknown) => void) =>
              rej(opts.insertError),
          };
        }
        return { then: (res: (v: unknown) => void) => res([]) };
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => ({
            then: (res: (v: unknown) => void) => {
              calls.push('update');
              res(opts.updatedRows ?? []);
            },
          }),
        }),
      }),
    }),
  };
  return { tx, calls };
}

describe('creditWalletTx guard contract (run #157)', () => {
  it('happy path: ledger insert + balance update both fire', async () => {
    const { tx, calls } = makeTx({
      priorRows: [],
      updatedRows: [{ wallet_balance: '15.00' }],
    });
    await creditWalletTx(tx as never, 'u1', 10, 'refund-join-ep1', 'REFUND', 'm1');
    expect(calls).toEqual(['insert', 'update']);
  });

  it('sequential replay (prior key found) → idempotent no-op, zero writes', async () => {
    const { tx, calls } = makeTx({
      priorRows: [{ id: 'tx-1' }],
      updatedRows: [{ wallet_balance: '15.00' }],
    });
    await creditWalletTx(tx as never, 'u1', 10, 'refund-join-ep1', 'REFUND', 'm1');
    expect(calls).toEqual([]);
  });

  it('vanished user row → clean 400, no partial credit (caller tx rolls back)', async () => {
    const { tx, calls } = makeTx({ priorRows: [], updatedRows: [] });
    await expect(
      creditWalletTx(tx as never, 'ghost', 10, 'refund-join-ep1', 'REFUND', 'm1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(calls).toEqual(['insert', 'update']); // both attempted in-tx; the 400 then aborts the whole caller tx (ledger row never commits)
  });

  it('concurrent same-key race (23505) → clean 409, never a raw 500', async () => {
    const { tx } = makeTx({ priorRows: [], insertError: { code: '23505' } });
    await expect(
      creditWalletTx(tx as never, 'u1', 10, 'refund-join-ep1', 'REFUND', 'm1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('non-23505 insert errors propagate untouched', async () => {
    const { tx } = makeTx({ priorRows: [], insertError: { code: '08006' } });
    await expect(
      creditWalletTx(tx as never, 'u1', 10, 'refund-join-ep1', 'REFUND', 'm1'),
    ).rejects.toMatchObject({ code: '08006' });
  });
});
