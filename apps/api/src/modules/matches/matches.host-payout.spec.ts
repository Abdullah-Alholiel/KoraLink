import { ConflictException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches, match_players, transactions, users } from '../../database/schema';
import { releaseHostPayoutInTx } from './matches.service';

type DB = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * Slice 3 — held host payout released EXACTLY ONCE on completion.
 * 1. payout = Σfee snapshots − margin×payers, floored at 0.
 * 2. State ≠ 'held' → no-op (idempotent).
 * 3. Guarded settle matching 0 rows → 409 (never double-credit).
 * 4. PRIZE ledger key per-match: `host-payout-${matchId}`.
 * 5. Zero payout still settles (without credit).
 */
const HOST = 'host-1';
const MATCH = 'match-1';
const MATCH_ARG = { id: MATCH, host_id: HOST, price_per_player: '10' };

function makeTx(args: { state: string; feeTotal: string; payers: number; settleRows?: number }) {
  const s = {
    ledger: [] as Array<Record<string, unknown>>,
    credits: [] as Array<Record<string, unknown>>,
    settleAttempts: 0,
    payoutState: args.state,
  };
  const deps = {
    matchesTable: matches,
    matchPlayersTable: match_players,
    usersTable: users,
    transactionsTable: transactions,
  };
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        const b: Record<string, unknown> = {};
        b.where = () => b;
        b.limit = () => b;
        b.for = () => b;
        b.then = (resolve: (v: unknown) => void) => {
          if (table === matches) resolve([{ id: MATCH, host_id: HOST, payout_state: s.payoutState }]);
          else if (table === match_players) resolve([{ total: args.feeTotal, payers: args.payers }]);
          else resolve([]);
        };
        return b;
      },
    }),
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        // Record at values() time: the service awaits the builder directly
        // (no .returning()) for the payout ledger row.
        if (table === transactions) s.ledger.push(v);
        const thenable = {
          then: (resolve: (v: unknown) => void) => resolve([{ id: 'x' }]),
        };
        return Object.assign(thenable, {
          returning: async () => {
            if (table === transactions) return [{ id: 'ptx' }];
            return [{ id: 'x' }];
          },
        });
      },
    }),
    update: (table: unknown) => ({
      set: (st: Record<string, unknown>) => ({
        where: () => {
          if (table === matches) {
            s.settleAttempts += 1;
            s.payoutState = String(st.host_payout_state);
            const out = { rowCount: args.settleRows ?? 1 };
            return { then: (r: (v: unknown) => void) => r(out) };
          }
          return {
            returning: async () => {
              if (table === users) { s.credits.push(st); return [{ wallet_balance: '50.00' }]; }
              return [];
            },
          };
        },
      }),
    }),
  };
  return { tx: tx as unknown as Tx, s, deps };
}

describe('releaseHostPayoutInTx — exactly-once payout', () => {
  it('credits Σfees − margin×payers with the per-match PRIZE key', async () => {
    const { tx, s, deps } = makeTx({ state: 'held', feeTotal: '30', payers: 3 });
    const out = await releaseHostPayoutInTx(tx, deps, MATCH_ARG, 5);
    expect(out).toEqual({ paid: true, amountSar: '15.00' });
    expect(s.credits).toHaveLength(1);
    expect(s.ledger[0].idempotency_key).toBe(`host-payout-${MATCH}`);
    expect(s.ledger[0].type).toBe('CREDIT');
    expect(s.ledger[0].reference_type).toBe('PRIZE');
    expect(s.payoutState).toBe('released');
  });

  it('no-ops when state is not held', async () => {
    const { tx, s, deps } = makeTx({ state: 'released', feeTotal: '30', payers: 3 });
    const out = await releaseHostPayoutInTx(tx, deps, MATCH_ARG, 5);
    expect(out.paid).toBe(false);
    expect(s.credits).toHaveLength(0);
    expect(s.ledger).toHaveLength(0);
  });

  it('never pays a cancelled match and settles zero-payout matches without credit', async () => {
    const c = makeTx({ state: 'cancelled', feeTotal: '90', payers: 9 });
    expect((await releaseHostPayoutInTx(c.tx, c.deps, MATCH_ARG, 5)).paid).toBe(false);
    expect(c.s.credits).toHaveLength(0);

    const z = makeTx({ state: 'held', feeTotal: '3', payers: 1 });
    const out = await releaseHostPayoutInTx(z.tx, z.deps, MATCH_ARG, 5);
    expect(out).toEqual({ paid: false, amountSar: '0.00' });
    expect(z.s.credits).toHaveLength(0);
    expect(z.s.payoutState).toBe('released');
  });

  it('aborts 409 when the guarded settle matches zero rows', async () => {
    const { tx, deps } = makeTx({ state: 'held', feeTotal: '30', payers: 3, settleRows: 0 });
    await expect(releaseHostPayoutInTx(tx, deps, MATCH_ARG, 5)).rejects.toThrow(ConflictException);
  });
});
