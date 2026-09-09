import { BadRequestException, ConflictException } from '@nestjs/common';
import { MatchesService, chargeMatchFeeTx } from './matches.service';
import {
  match_players,
  match_waitlist,
  matches,
  transactions,
  users,
} from '../../database/schema';

/**
 * Slice 2 — player-host-responsibility: server-authoritative join payment.
 *
 * Invariants under test:
 * 1. A paid match REQUIRES an idempotency key (400 otherwise) — a paid seat
 *    can never be created outside the ledger.
 * 2. Insufficient balance throws 400 and NO fee snapshot is written (the
 *    roster row itself is rolled back by the tx primitive — "no seat
 *    without payment").
 * 3. The fee idempotency key is PER-EPISODE (`join:<match_players.id>:<key>`)
 *    — never {match,user} (run #20: that 500s on legal join→leave→rejoin).
 * 4. Free matches charge nothing and don't require a key.
 * 5. A user already holding a roster row (e.g. the host, seated at create)
 *    can never reach the charge path ("already joined" guard first).
 * 6. chargeMatchFeeTx: replay returns 'REPLAYED' without inserting; a
 *    concurrent same-key race (23505) surfaces as 409, never a 500.
 */
describe('MatchesService.joinMatch — atomic fee charge (player-host-responsibility)', () => {
  const USER = 'user-1';
  const MATCH = 'match-1';
  const EPISODE_ID = 'episode-abc-1';
  const KEY = '0b6f8be2-1111-4111-8111-000000000001';

  interface TxState {
    ledger: Array<Record<string, unknown>>;
    balanceWrites: Array<Record<string, unknown>>;
    snapshots: Array<Record<string, unknown>>;
    rosterInserts: Array<Record<string, unknown>>;
  }

  function makeTx(args: {
    price: string;
    deductRows?: number;
    priorFee?: boolean;
    alreadyJoined?: boolean;
  }) {
    const state: TxState = {
      ledger: [],
      balanceWrites: [],
      snapshots: [],
      rosterInserts: [],
    };

    const tx = {
      select: (proj?: Record<string, unknown>) => ({
        from: (table: unknown) => {
          const builder: Record<string, unknown> = {};
          builder.innerJoin = () => builder;
          builder.where = () => builder;
          builder.limit = () => builder;
          builder.for = () => builder;
          builder.then = (resolve: (v: unknown) => void) => {
            let rows: unknown[] = [];
            if (table === matches) {
              rows = [
                { id: MATCH, status: 'Open', max_players: 4, price_per_player: args.price },
              ];
            } else if (table === match_players) {
              const keys = Object.keys(proj ?? {});
              if (keys.includes('id')) {
                rows = args.alreadyJoined ? [{ id: 'existing' }] : [];
              } else if (keys.includes('count')) {
                rows = [{ count: 1 }];
              } else if (keys.includes('homeCount')) {
                rows = [{ homeCount: 1 }];
              } else if (keys.includes('awayCount')) {
                rows = [{ awayCount: 0 }];
              }
            } else if (table === match_waitlist) {
              rows = []; // not queued
            } else if (table === transactions) {
              rows = args.priorFee ? [{ id: 'prior-tx' }] : [];
            }
            resolve(rows);
          };
          return builder;
        },
      }),
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          const ret: Record<string, unknown> = {};
          ret.returning = async () => {
            if (table === match_players) {
              state.rosterInserts.push(v);
              return [{ id: EPISODE_ID }];
            }
            if (table === transactions) {
              state.ledger.push(v);
              return [{ id: 'fee-tx-1' }];
            }
            return [{ id: 'x' }];
          };
          ret.then = (resolve: (v: unknown) => void) => resolve([{ id: 'x' }]);
          return ret;
        },
      }),
      update: (table: unknown) => ({
        set: (s: Record<string, unknown>) => {
          // Record at set() time: the service awaits some updates directly
          // (no .returning) and others via .returning() — capture both.
          if (table === users) state.balanceWrites.push(s);
          if (table === match_players) state.snapshots.push(s);
          return {
            where: () => {
              const thenable = {
                then: (resolve: (v: unknown) => void) =>
                  resolve(table === users ? [{ wallet_balance: '0.00' }] : []),
              };
              return Object.assign(thenable, {
                returning: async () =>
                  table === users
                    ? [
                        {
                          wallet_balance:
                            args.deductRows === 0 ? '-2.00' : '0.00',
                        },
                      ]
                    : [{ id: EPISODE_ID }],
              });
            },
          };
        },
      }),
      delete: () => ({
        where: () => ({
          then: (resolve: (v: unknown) => void) => resolve([]),
        }),
      }),
    };
    return { tx, state };
  }

  function makeDb(tx: unknown) {
    const transaction = jest.fn(async (cb: (tx2: unknown) => Promise<unknown>) => cb(tx));
    return {
      transaction,
      select: () => ({
        from: () => {
          const b: Record<string, unknown> = {};
          b.where = () => b;
          b.then = (resolve: (v: unknown) => void) => resolve([]); // participants fan-out
          return b;
        },
      }),
      query: {
        matches: {
          findFirst: async () => ({
            id: MATCH,
            host_id: 'host-1',
            status: 'Open',
            scheduled_at: new Date(Date.now() + 3600_000),
            start_time: null,
            duration_mins: 90,
            max_players: 4,
            price_per_player: 10,
            booking_mode: 'self',
            is_player_hosted: true,
            host_payout_state: 'held',
            players: [],
            match_players: [],
            _count: { players: 2 },
          }),
        },
      },
    };
  }

  function makeService(db: unknown) {
    return new MatchesService(
      db as never,
      {} as never, // walletService
      {} as never, // appGateway (broadcast errors are caught)
      { sendPushToUsers: async () => 0 } as never,
      { record: async () => undefined } as never,
      { getNumber: async (_k: string, fb: number) => fb } as never,
      {} as never, // realtime
      { promoteNextInTx: async () => null } as never,
    );
  }

  it('rejects a paid join with 400 when the idempotency key is missing', async () => {
    const { tx, state } = makeTx({ price: '10.00' });
    const svc = makeService(makeDb(tx));

    await expect(svc.joinMatch(USER, MATCH)).rejects.toThrow(BadRequestException);
    await expect(svc.joinMatch(USER, MATCH)).rejects.toThrow(/idempotencyKey is required/);
    // No fee snapshot was written — the tx rolled back.
    expect(state.snapshots).toHaveLength(0);
  });

  it('charges the fee inside the join tx with a PER-EPISODE idempotency key', async () => {
    const { tx, state } = makeTx({ price: '10.00' });
    const svc = makeService(makeDb(tx));

    const res = (await svc.joinMatch(USER, MATCH, KEY)) as {
      join: { episodeId: string; idempotentReplay: boolean };
    };

    expect(state.ledger).toHaveLength(1);
    // Run #20 regression: the key MUST embed the roster-episode id, never {match,user}.
    expect(state.ledger[0].idempotency_key).toBe(`join:${EPISODE_ID}:${KEY}`);
    expect(state.ledger[0].type).toBe('DEBIT');
    expect(state.ledger[0].reference_type).toBe('MATCH_FEE');
    expect(state.ledger[0].reference_id).toBe(MATCH);
    expect(state.ledger[0].status).toBe('Completed');
    // Per-episode fee snapshot for slice-4 refunds.
    expect(state.snapshots).toEqual([{ fee_paid_sar: '10.00' }]);
    expect(state.balanceWrites).toHaveLength(1);
    expect(res.join.episodeId).toBe(EPISODE_ID);
    expect(res.join.idempotentReplay).toBe(false);
  });

  it('throws 400 on insufficient balance and never writes the fee snapshot', async () => {
    const { tx, state } = makeTx({ price: '10.00', deductRows: 0 });
    const svc = makeService(makeDb(tx));

    await expect(svc.joinMatch(USER, MATCH, KEY)).rejects.toThrow(
      'Insufficient wallet balance.',
    );
    expect(state.snapshots).toHaveLength(0);
  });

  it('free matches join without a key and never touch the ledger', async () => {
    const { tx, state } = makeTx({ price: '0.00' });
    const svc = makeService(makeDb(tx));

    await svc.joinMatch(USER, MATCH); // no key — must resolve
    expect(state.ledger).toHaveLength(0);
    expect(state.balanceWrites).toHaveLength(0);
    expect(state.snapshots).toHaveLength(0);
    expect(state.rosterInserts).toHaveLength(1);
  });

  it('never charges a user who already holds a roster row (host re-join guard)', async () => {
    const { tx, state } = makeTx({ price: '10.00', alreadyJoined: true });
    const svc = makeService(makeDb(tx));

    await expect(svc.joinMatch(USER, MATCH, KEY)).rejects.toThrow(/already joined/);
    expect(state.ledger).toHaveLength(0);
    expect(state.balanceWrites).toHaveLength(0);
  });
});

describe('chargeMatchFeeTx — replay + concurrency (player-host-responsibility)', () => {
  const USER = 'user-1';
  const MATCH = 'match-1';
  const KEY = 'join:episode-1:aaa';

  function replayTx(prior: boolean, violation = false) {
    const inserted: Array<Record<string, unknown>> = [];
    const tx = {
      select: () => ({
        from: (table: unknown) => {
          const b: Record<string, unknown> = {};
          b.where = () => b;
          b.limit = () => b;
          b.then = (resolve: (v: unknown) => void) =>
            resolve(prior && table === transactions ? [{ id: 'prior' }] : []);
          return b;
        },
      }),
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          const ret: Record<string, unknown> = {};
          ret.returning = async () => {
            if (violation && table === transactions) {
              const err = new Error('duplicate key') as Error & {
                code?: string;
                constraint?: string;
              };
              err.code = '23505';
              err.constraint = 'transactions_idempotency_key_unique';
              throw err;
            }
            inserted.push(v);
            return [{ id: 'tx-1' }];
          };
          return ret;
        },
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ wallet_balance: '5.00' }],
          }),
        }),
      }),
    };
    return { tx, inserted };
  }

  it('returns REPLAYED without inserting when the key already exists', async () => {
    const { tx, inserted } = replayTx(true);
    const out = await chargeMatchFeeTx(tx as never, USER, MATCH, 10, KEY);
    expect(out).toBe('REPLAYED');
    expect(inserted).toHaveLength(0);
  });

  it('surfaces a concurrent same-key race as 409 (never a 500)', async () => {
    const { tx } = replayTx(false, true);
    await expect(chargeMatchFeeTx(tx as never, USER, MATCH, 10, KEY)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects non-positive amounts', async () => {
    const { tx } = replayTx(false);
    await expect(chargeMatchFeeTx(tx as never, USER, MATCH, 0, KEY)).rejects.toThrow(
      BadRequestException,
    );
  });
});
