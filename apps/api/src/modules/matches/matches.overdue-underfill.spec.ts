import { MatchesService } from './matches.service';
import {
  match_players,
  pitch_slots,
  transactions,
  users,
} from '../../database/schema';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * 2026-09-10 KSU incident regression (prod, match 57377940…):
 * Render FREE spun down overnight; the every-10-minutes underfill cron missed
 * the whole 60-minute auto-cancel band; on the morning wake-up,
 * `autoCompletePastMatches` flipped a 1/14-player 7v7 (min_players=12) to
 * "Completed". Two Sep-6 matches had hit the same trap.
 *
 * Fix under test (three layers):
 * 1. `autoCompletePastMatches` cancels past-kickoff underfilled matches FIRST
 *    (same atomic refund/notify path as the proactive band), and its bulk
 *    complete carries an explicit never-complete-underfilled guard.
 * 2. `resolveEffectiveStatus` reads underfilled-past-end as Cancelled at
 *    query time — correct display even between ticks (InProgress exempt).
 * 3. Legacy rows (min_players = 0) stay exempt from the rule.
 */
describe('autoCompletePastMatches — overdue underfill net (KSU incident)', () => {
  const OVERDUE_KORALINK_ROW = {
    id: 'match-ksu',
    title: '7v7 Match at KSU Stadium',
    host_id: 'host-1',
    booking_mode: 'koralink',
    booking_slot_id: 'slot-1',
    pitch_cost_sar: '200.00',
    min_players: 12,
    is_player_hosted: false,
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
   * atomicity spec: the overdue SELECT (net), the bulk UPDATE (complete),
   * everything else → []. The payout-release SELECT resolves [].
   */
  function makeService(
    opts: {
      overdueRows?: unknown[];
      strandedRows?: unknown[];
      completedCount?: number;
      guardRowCount?: number;
    } = {},
  ) {
    const txCalls: CapturedCall[] = [];
    const order: string[] = [];
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
          where: () =>
            record(
              table === users ? 'tx:credit' : table === pitch_slots ? 'tx:slot' : 'tx:update',
              table,
              setArg,
            ),
        }),
      }),
      insert: (table: unknown) => ({
        values: (valuesArg: Record<string, unknown>) => {
          txCalls.push({ op: 'tx:ledger', table, valuesArg });
          order.push('tx:ledger');
          return thenable();
        },
      }),
    };
    const record = (op: string, table?: unknown, setArg?: Record<string, unknown>) => {
      txCalls.push({ op, table, setArg });
      order.push(op);
      return thenable();
    };

    const db = {
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
      execute: jest.fn(async (query: unknown) => {
        const text = new PgDialect().sqlToQuery(query as never).sql;
        executedSql.push(text);
        if (text.includes("SET status = 'Completed'")) {
          order.push('bulk:complete');
          return { count: opts.completedCount ?? 0 };
        }
        if (text.includes('FROM matches m')) {
          // The stranded-row sweep (2026-09-11 Al-Nakheel heal) also reads
          // FROM matches m — it is the one filtering status = 'Completed'.
          if (text.includes("'Completed'")) {
            order.push('sweep:select');
            return opts.strandedRows ?? [];
          }
          order.push('net:select');
          return opts.overdueRows ?? [];
        }
        return [];
      }),
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === match_players) {
              order.push('post:select-roster');
              resolve([{ user_id: 'host-1' }]);
            } else {
              resolve([]);
            }
          };
          return chain;
        },
      }),
      query: { matches: { findFirst: async () => null } },
    };

    const recordActivity = jest.fn(async () => {
      order.push('post:activity');
    });
    const sendPush = jest.fn(async () => {
      order.push('post:push');
    });

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
    return { svc, tx, txCalls, order, db, executedSql, recordActivity, sendPush };
  }

  it('cancels the overdue underfilled match via the atomic path BEFORE completing anything', async () => {
    const { svc, txCalls, order, db, recordActivity, sendPush } = makeService({
      overdueRows: [OVERDUE_KORALINK_ROW],
    });

    const result = await svc.autoCompletePastMatches();

    // The net cancelled it — the match is NOT counted as completed. The
    // stranded-row sweep (3rd statement, Al-Nakheel heal) found nothing here.
    expect(result.cancelled).toBe(1);
    expect(result.completed).toBe(0);
    // Cancel ran through the shared atomic path (guard + host refund + ledger
    // + slot release, one transaction), and it committed BEFORE the bulk
    // complete statement ran.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(txCalls.map((c) => c.op)).toEqual(['tx:credit', 'tx:ledger', 'tx:slot']);
    expect(order.indexOf('tx:credit')).toBeGreaterThan(-1);
    expect(order.indexOf('bulk:complete')).toBeGreaterThan(order.indexOf('tx:slot'));
    expect(order).toContain('sweep:select');
    // Roster told "cancelled" — bell + push, never "completed".
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'match_auto_cancelled',
        matchId: OVERDUE_KORALINK_ROW.id,
      }),
    );
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it('never completes an underfilled row even when the net missed it (bulk-guard belt)', async () => {
    const { svc, executedSql } = makeService({ overdueRows: [], completedCount: 0 });

    await svc.autoCompletePastMatches();

    // The bulk UPDATE itself carries the NOT-underfilled guard as a second
    // belt (race between the net's SELECT and the bulk UPDATE).
    const bulk = executedSql.find((t) => t.includes("SET status = 'Completed'"))!;
    expect(bulk).toContain('NOT');
    expect(bulk).toContain('min_players');
  });

  it('still completes fully-rostered past matches (net selects nothing)', async () => {
    const { svc, db, order } = makeService({ overdueRows: [], completedCount: 3 });

    const result = await svc.autoCompletePastMatches();

    expect(result.completed).toBe(3);
    expect(result.cancelled).toBe(0);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(order).toEqual(['net:select', 'bulk:complete', 'sweep:select']);
  });

  it('exempts legacy rows (min_players = 0) from the net and the bulk guard', async () => {
    const { svc, executedSql } = makeService({ overdueRows: [], completedCount: 1 });

    await svc.autoCompletePastMatches();

    const net = executedSql.find((t) => t.includes('FROM matches m'))!;
    expect(net).toContain('m.min_players > 0');
    const bulk = executedSql.find((t) => t.includes("SET status = 'Completed'"))!;
    expect(bulk).toContain('min_players > 0');
  });

  it('counts nothing when the guard loses the race (concurrent cancel)', async () => {
    const { svc, txCalls, recordActivity, sendPush } = makeService({
      overdueRows: [OVERDUE_KORALINK_ROW],
      guardRowCount: 0,
    });

    const result = await svc.autoCompletePastMatches();

    expect(result.cancelled).toBe(0);
    expect(txCalls).toHaveLength(0);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });
});

describe('resolveEffectiveStatus — underfill rule at query time', () => {
  const resolve = (MatchesService as unknown as {
    resolveEffectiveStatus: (m: unknown) => string;
  }).resolveEffectiveStatus;

  const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const IN_TWO_HOURS = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const base = {
    scheduled_at: TWO_HOURS_AGO,
    duration_mins: 60, // ended an hour ago
    completed_at: null,
  };

  it('reads a past-kickoff underfilled Open match as Cancelled (KSU display fix)', () => {
    expect(
      resolve({ ...base, status: 'Open', min_players: 12, total_players: 1 }),
    ).toBe('Cancelled');
  });

  it('still reads a fully-rostered past match as Completed', () => {
    expect(
      resolve({ ...base, status: 'Open', min_players: 12, total_players: 12 }),
    ).toBe('Completed');
  });

  it('exempts InProgress matches — started games may dip below minimum', () => {
    expect(
      resolve({ ...base, status: 'InProgress', min_players: 12, total_players: 5 }),
    ).toBe('Completed');
  });

  it('exempts legacy rows (min_players = 0)', () => {
    expect(
      resolve({ ...base, status: 'Open', min_players: 0, total_players: 1 }),
    ).toBe('Completed');
  });

  it('leaves terminal states untouched', () => {
    expect(
      resolve({ ...base, status: 'Completed', min_players: 12, total_players: 1 }),
    ).toBe('Completed');
    expect(
      resolve({ ...base, status: 'Cancelled', min_players: 12, total_players: 1 }),
    ).toBe('Cancelled');
  });

  it('leaves future matches untouched', () => {
    expect(
      resolve({
        ...base,
        scheduled_at: IN_TWO_HOURS,
        status: 'Open',
        min_players: 12,
        total_players: 1,
      }),
    ).toBe('Open');
  });

  it('defaults to Completed when the roster count is unknown (safe legacy behaviour)', () => {
    expect(resolve({ ...base, status: 'Open' })).toBe('Completed');
    expect(resolve({ ...base, status: 'Open', min_players: 12 })).toBe('Completed');
  });
});
