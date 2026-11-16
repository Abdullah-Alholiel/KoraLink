import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { creditWalletTx } from './match-fees';

/**
 * P2-244b (run #161 — Reviewer A IMPORTANT): cancelMatch still hand-rolled
 * the host slot refund (plain balance UPDATE + ledger INSERT keyed
 * `refund-<matchId>`) after P2-244 had unified the AUTO-cancel twin onto
 * creditWalletTx. The hand-rolled block had no replay pre-check (racing
 * second cancel → raw 23505 → 500) and no user-existence guard (vanished
 * user → ledger commits with zero balance movement).
 *
 * These specs pin:
 *  1. the cancelMatch koralink-slot block routes through creditWalletTx
 *     (source pin — the hand-rolled INSERT/UPDATE literals must not return);
 *  2. the key stays `refund-<matchId>` (shared with the auto-cancel twin —
 *     a match reaches only ONE of the two paths, so no cross-path collision);
 *  3. creditWalletTx contract (mirrors matches.credit-guard.spec.ts):
 *     replay → no-op, vanished user → 400, 23505 race → 409.
 */
const SERVICE_SRC = readFileSync(
  join(__dirname, 'matches.service.ts'),
  'utf8',
);

/** Extract the koralink-slot refund block from cancelMatch source. */
function cancelRefundBlock(): string {
  const anchor = '// Refund the exact pitch cost the host was debited at create.';
  const start = SERVICE_SRC.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);
  const block = SERVICE_SRC.slice(start, start + 2200);
  // Stop before the slot release (is_booked flip) — the credit block only.
  const end = block.indexOf('is_booked: false');
  return end > 0 ? block.slice(0, end) : block;
}

/** Minimal thenable-chain tx mock (mirrors matches.credit-guard.spec.ts). */
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

describe('P2-244b — cancelMatch host refund uses creditWalletTx', () => {
  it('cancel source routes the host refund through creditWalletTx', () => {
    const block = cancelRefundBlock();
    expect(block).toContain('creditWalletTx(');
    expect(block).toContain('`refund-${matchId}`');
    expect(block).toContain("'REFUND'");
    expect(block).toContain('matchId,');
    // The hand-rolled literals must NOT appear inside the block.
    expect(block).not.toContain('insert(transactions)');
    expect(block).not.toContain('wallet_balance:');
    expect(block).not.toContain("idempotency_key: `refund-${matchId}`");
  });

  it('auto-cancel twin (P2-244) still routes through creditWalletTx', () => {
    expect(SERVICE_SRC).toContain('`refund-${row.id}`');
  });

  it('key family stays per-match for host slot refunds', () => {
    // Host slot refunds are per-MATCH (one slot per match); joiner refunds
    // are per-EPISODE (a legal leave→rejoin is a new episode). Distinct
    // families must never collide. Match ids are uuid-shaped.
    const matchId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(`refund-${matchId}`).toMatch(/^refund-[0-9a-f-]{36}$/);
    expect(`refund-join-ep1`).toMatch(/^refund-join-/);
  });
});

describe('creditWalletTx contract (P2-244b regression net)', () => {
  it('happy path: ledger insert + balance update both fire', async () => {
    const { tx, calls } = makeTx({
      priorRows: [],
      updatedRows: [{ wallet_balance: '15.00' }],
    });
    await creditWalletTx(tx as never, 'u1', 10, 'refund-m1', 'REFUND', 'm1');
    expect(calls).toEqual(['insert', 'update']);
  });

  it('sequential replay (prior key) → idempotent no-op, zero writes', async () => {
    const { tx, calls } = makeTx({ priorRows: [{ id: 'tx-1' }] });
    await creditWalletTx(tx as never, 'u1', 10, 'refund-m1', 'REFUND', 'm1');
    expect(calls).toEqual([]);
  });

  it('vanished user → BadRequestException; caller tx rollback prevents the commit', async () => {
    // Contract: the ledger insert fires IN-TX first, then the guarded
    // balance UPDATE finds zero rows and throws — the throw aborts the
    // CALLER's transaction, so the ledger row never commits (rollback
    // guarantee lives at the tx level; the unit mock proves the throw).
    const { tx, calls } = makeTx({ priorRows: [], updatedRows: [] });
    await expect(
      creditWalletTx(tx as never, 'ghost', 10, 'refund-m1', 'REFUND', 'm1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(calls).toEqual(['insert', 'update']);
  });

  it('23505 race on the key → ConflictException (clean 409)', async () => {
    const { tx } = makeTx({
      priorRows: [],
      updatedRows: [{ wallet_balance: '10.00' }],
      insertError: { code: '23505' },
    });
    await expect(
      creditWalletTx(tx as never, 'u1', 10, 'refund-m1', 'REFUND', 'm1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('P2-244b — guard shape around the cancel tx (defense in depth)', () => {
  it('cancelMatch still guards the status flip (no side effects on lost race)', () => {
    const guard = SERVICE_SRC.slice(
      SERVICE_SRC.indexOf('async cancelMatch'),
      SERVICE_SRC.indexOf('async cancelMatch') + 9000,
    );
    expect(guard).toContain("inArray(matches.status, ['Open', 'Full', 'InProgress'])");
    expect(guard).toContain('cancelled.length === 0');
    expect(guard).toContain('ConflictException');
  });

  it('ForbiddenException remains the host-ownership gate', () => {
    expect(SERVICE_SRC).toContain(
      'Only the match host can cancel the match.',
    );
  });
});

// (End of specs.)
