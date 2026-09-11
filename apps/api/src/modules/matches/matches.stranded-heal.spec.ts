import { MatchesService } from './matches.service';
import { matches, match_players, match_waitlist } from '../../database/schema';
import { BadRequestException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * 2026-09-11 Al-Nakheel incident regression (prod, match fbf61b5a…):
 * a self-hosted, player-hosted 11v11 (1/22 roster, min_players = 20) was
 * auto-COMPLETED at 13:20 UTC on Sep 10 by the PRE-PR-#22 code (no underfill
 * net yet); PR #22 went live ~16:10 UTC and — because terminal states are
 * never re-examined — could never see the row. It showed "Match Completed"
 * to a host who never had a game. The Sep-10 repair script fixed the 3 KSU
 * victims by hand but could not prevent the CLASS.
 *
 * Fix under test (two layers):
 * 1. `healStrandedCompletedMatches` — self-healing sweep of wrongly-completed
 *    below-minimum rows, wired into every auto-complete tick. The SELECT
 *    predicate is false-positive-proof (bulk-complete signature + last-write
 *    gap) and the heal goes through the SAME atomic cancel path as the live
 *    net (refunds + payout flip + waitlist clear + notify).
 * 2. `leaveMatch` terminal-state guard — roster of an ended match is final,
 *    so a post-facto leave can never shrink a legitimately-played roster
 *    below min_players and create a FALSE stranded row for the sweep.
 */
describe('healStrandedCompletedMatches — stranded-row self-heal (Al-Nakheel incident)', () => {
  const STRANDED_ROW = {
    id: 'match-nakheel',
    title: 'مباراة 11v11 في Al-Nakheel Sports Complex',
    host_id: 'host-1',
    booking_mode: 'self',
    booking_slot_id: null,
    pitch_cost_sar: '400.00',
    min_players: 20,
    is_player_hosted: true,
    total_players: 1,
  };

  interface CapturedCall {
    op: string;
    table?: unknown;
    setArg?: Record<string, unknown>;
    valuesArg?: Record<string, unknown>;
  }

  function thenable(): { then: (r: (v: unknown) => void) => void } {
    return { then: (r: (v: unknown) => void) => r([]) };
  }

  /**
   * db.execute routes by serialized SQL (PgDialect), exactly like the
   * overdue-underfill spec: the stranded SELECT ("FROM matches m" + the
   * Completed signature) returns opts.rows; everything else → [].
   */
  function makeService(
    opts: { rows?: unknown[]; guardRowCount?: number } = {},
  ) {
    const txCalls: CapturedCall[] = [];
    const executedSql: string[] = [];

    const tx = {
      execute: jest.fn(async () => ({ rowCount: opts.guardRowCount ?? 1 })),
      select: () => ({
        from: () => {
          const chain: Record<string, unknown> = {};
          chain.where = () => chain;
          chain.then = (resolve: (v: unknown) => void) => resolve([]);
          return chain;
        },
      }),
      update: (table: unknown) => ({
        set: (setArg: Record<string, unknown>) => ({
          where: () => {
            txCalls.push({
              op:
                table === matches
                  ? 'tx:match-update'
                  : 'tx:update',
              table,
              setArg,
            });
            return thenable();
          },
        }),
      }),
      insert: jest.fn(() => ({
        values: (valuesArg: Record<string, unknown>) => {
          txCalls.push({ op: 'tx:ledger', table: undefined, valuesArg });
          return thenable();
        },
      })),
    };

    const db = {
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
      execute: jest.fn(async (query: unknown) => {
        const text = new PgDialect().sqlToQuery(query as never).sql;
        executedSql.push(text);
        if (text.includes('FROM matches m') && text.includes("'Completed'")) {
          return opts.rows ?? [];
        }
        return [];
      }),
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === match_players) {
              resolve([{ user_id: 'host-1' }]);
            } else {
              // matches (payout sweep) / match_waitlist (queue clear) → empty.
              resolve([]);
            }
          };
          return chain;
        },
      }),
      query: { matches: { findFirst: async () => null } },
    };

    const recordActivity = jest.fn(async () => {});
    const sendPush = jest.fn(async () => {});

    const svc = new MatchesService(
      db as never,
      {} as never,
      {} as never,
      { sendPushToUsers: sendPush } as never,
      { record: recordActivity } as never,
      {} as never,
      {} as never,
      { promoteNextInTx: async () => null } as never,
    );
    return { svc, tx, txCalls, db, executedSql, recordActivity, sendPush };
  }

  it('heals the stranded row through the SHARED atomic cancel path (payout flip, no slot)', async () => {
    const { svc, txCalls, db, recordActivity, sendPush } = makeService({
      rows: [STRANDED_ROW],
    });

    const healed = await svc.healStrandedCompletedMatches();

    expect(healed).toBe(1);
    // Same transaction shape as the live net for a self-mode player-hosted
    // row: status guard → per-payer refunds (none here) → payout held→cancelled.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(txCalls.map((c) => c.op)).toEqual(['tx:match-update']);
    expect(txCalls[0].setArg).toMatchObject({ host_payout_state: 'cancelled' });
    // Host told "cancelled" — bell + push, never "completed".
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'match_auto_cancelled',
        matchId: STRANDED_ROW.id,
      }),
    );
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it('SELECT predicate is false-positive-proof (bulk signature only — no updated_at test)', async () => {
    const { svc, executedSql } = makeService({ rows: [] });

    await svc.healStrandedCompletedMatches();

    const sel = executedSql.find((t) => t.includes('FROM matches m'))!;
    // Only rows the BULK COMPLETE flipped (completed_at == scheduled end, to
    // microsecond precision — a host's UI click can never land exactly there).
    expect(sel).toContain("'Completed'");
    expect(sel).toContain(
      'm.completed_at',
    );
    expect(sel).toContain('m.scheduled_at');
    // Legacy rows exempt; roster re-check below minimum.
    expect(sel).toContain('m.min_players > 0');
    expect(sel).toContain('< m.min_players');
    // The write-gap test is FORBIDDEN: the payout release bumps updated_at
    // milliseconds after the bulk flip (Nakheel: +245 ms), so no gap
    // threshold can separate victims from played matches.
    expect(sel).not.toContain('updated_at');
  });

  it('bulk complete stamps NOW() for InProgress rows — played-with-withdrawals can never carry the signature', async () => {
    const { svc, executedSql } = makeService({ rows: [] });

    await svc.autoCompletePastMatches();

    const bulk = executedSql.find((t) => t.includes("SET status = 'Completed'"))!;
    // CASE branch: InProgress rows get their TRUE end (NOW()); only Open/Full
    // rows carry the computable bulk signature the sweep keys on.
    expect(bulk).toContain('CASE');
    expect(bulk).toContain('NOW()');
    expect(bulk).toContain("status = 'InProgress'");
  });

  it('counts nothing when the guard loses the race (concurrently re-joined)', async () => {
    const { svc, txCalls, recordActivity, sendPush } = makeService({
      rows: [STRANDED_ROW],
      guardRowCount: 0,
    });

    const healed = await svc.healStrandedCompletedMatches();

    expect(healed).toBe(0);
    expect(txCalls).toHaveLength(0);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('is a zero-cost no-op when no stranded rows exist (steady state)', async () => {
    const { svc, db } = makeService({ rows: [] });

    const healed = await svc.healStrandedCompletedMatches();

    expect(healed).toBe(0);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('runs INSIDE autoCompletePastMatches and reports healed rows as cancelled', async () => {
    const { svc, db, executedSql } = makeService({ rows: [] });

    const result = await svc.autoCompletePastMatches();

    expect(result.cancelled).toBe(0);
    // Net SELECT (Open/Full), bulk complete, then the stranded sweep — all
    // three statements fired on one tick.
    const net = executedSql.find(
      (t) => t.includes('FROM matches m') && t.includes("'Open'"),
    );
    const bulk = executedSql.find((t) => t.includes("SET status = 'Completed'"));
    const sweep = executedSql.find(
      (t) =>
        t.includes('FROM matches m') &&
        t.includes("'Completed'") &&
        !t.includes('SET status'),
    );
    expect(net).toBeDefined();
    expect(bulk).toBeDefined();
    expect(sweep).toBeDefined();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('leaveMatch — terminal-state roster guard (attendance-record immutability)', () => {
  const USER = 'user-1';
  const HOST = 'host-1';
  const MATCH_ID = 'match-1';

  function thenable(): { then: (r: (v: unknown) => void) => void } {
    return { then: (r: (v: unknown) => void) => r([]) };
  }

  function makeService(opts: { status: string; withMatchRow?: boolean }) {
    const tx = {
      execute: jest.fn(async () => thenable()),
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === matches) {
              resolve(
                opts.withMatchRow === false
                  ? []
                  : [
                      {
                        status: opts.status,
                        host_id: 'host-1',
                        min_players: 4,
                        total_players: 2,
                      },
                    ],
              );
            } else {
              resolve([{ id: 'mp-1', is_host: false, fee_paid_sar: null }]);
            }
          };
          return chain;
        },
      }),
      update: () => ({ set: () => ({ where: () => thenable() }) }),
      delete: () => ({ where: () => thenable() }),
      insert: () => ({
        values: () => thenable(),
      }),
    };

    const db = {
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
      query: {
        matches: {
          findFirst: async () => ({
            id: MATCH_ID,
            status: 'Open',
            title: 'T',
            scheduled_at: new Date('2030-01-01T18:00:00Z'),
            duration_mins: 90,
            completed_at: null,
            host: { id: 'host-1', full_name: 'H' },
            pitch: null,
            players: [
              { id: HOST, is_host: true, user: { id: HOST, full_name: 'H' }, no_show: false },
              { id: USER, is_host: false, user: { id: USER, full_name: 'P' }, no_show: false },
            ],
            messages: [],
          }),
        },
      },
      select: () => ({
        from: () => ({
          where: () => {
            const chain: any = {
              limit: () => ({
                then: (r: (v: unknown) => void) =>
                  r([
                    {
                      id: MATCH_ID,
                      title: 'T',
                      scheduled_at: new Date('2030-01-01T18:00:00Z'),
                      duration_mins: 90,
                      status: 'Open',
                      host: { id: 'host-1', full_name: 'H' },
                      pitch: null,
                      players: [],
                      waitlist_count: 0,
                      comments: [],
                    },
                  ]),
              }),
            };
            chain.then = (r: (v: unknown) => void) =>
              r([{ user_id: USER }]);
            return chain;
          },
        }),
      }),
    };
    const svc = new MatchesService(
      db as never,
      {} as never,
      { broadcastRosterUpdate: () => {}, broadcastStatusUpdate: () => {} } as never,
      { sendPushToUsers: async () => {} } as never,
      { record: async () => {} } as never,
      { getNumber: async () => 0 } as never,
      { broadcastOps: () => {} } as never,
      { promoteNextInTx: async () => null } as never,
    );
    return { svc, tx };
  }

  it('rejects leaving a COMPLETED match (roster is the attendance record)', async () => {
    const { svc } = makeService({ status: 'Completed' });
    await expect(svc.leaveMatch(USER, MATCH_ID)).rejects.toThrow(BadRequestException);
  });

  it('rejects leaving a CANCELLED match', async () => {
    const { svc } = makeService({ status: 'Cancelled' });
    await expect(svc.leaveMatch(USER, MATCH_ID)).rejects.toThrow(BadRequestException);
  });

  it('still allows leaving an OPEN match', async () => {
    const { svc } = makeService({ status: 'Open' });
    await expect(svc.leaveMatch(USER, MATCH_ID)).resolves.toBeDefined();
  });

  it('still allows leaving an INPROGRESS match (documented mid-game withdrawal)', async () => {
    const { svc } = makeService({ status: 'InProgress' });
    await expect(svc.leaveMatch(USER, MATCH_ID)).resolves.toBeDefined();
  });

  it('throws NotFound when the match row vanished mid-transaction', async () => {
    const { svc } = makeService({ status: 'Open', withMatchRow: false });
    await expect(svc.leaveMatch(USER, MATCH_ID)).rejects.toThrow(
      new RegExp('not found', 'i'),
    );
  });
});
