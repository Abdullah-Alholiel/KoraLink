import { MatchesService } from './matches.service';
import { matches } from '../../database/schema';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * Run #229 — payout-hold flip observability (Reviewer A residual + Claude
 * tier-B review round on PR #297).
 *
 * The guarded `host_payout_state held → cancelled` flip previously discarded
 * the affected-rows result: if a concurrent completion released the hold
 * first, the cancel proceeded with the host ALREADY PAID — a money anomaly
 * that was invisible. The flip now reads the driver-shape-tolerant affected
 * count (`.rowCount` in jest mocks, `.count` in prod postgres-js — mirror of
 * the :141 settle-guard) and ALERTS (logger.error + Sentry.captureException,
 * tag `host_payout_hold_lost_race`) on 0 affected rows.
 *
 * These specs pin the branch contract:
 *  - {rowCount: 0} (jest-mock shape) fires the alert;
 *  - {count: 0} (prod postgres-js shape) fires the alert;
 *  - a shape-less result (optimistic default 1) stays SILENT — the happy
 *    path must never log a false anomaly;
 *  - a row that was never `held` never touches the flip at all (the
 *    auto-cancel path pre-checks `row.host_payout_state === 'held'` so
 *    non-held rows can't false-fire — the manual cancelMatch path checks
 *    before entering the branch).
 */

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/node';

const HELD_ROW = {
  id: 'match-held-1',
  title: 'Underfilled Tuesday',
  host_id: 'host-1',
  booking_mode: 'self',
  booking_slot_id: null,
  pitch_cost_sar: null,
  min_players: 8,
  is_player_hosted: true,
  total_players: 3,
  host_payout_state: 'held',
};

function thenable(): { then: (r: (v: unknown) => void) => void } {
  return { then: (r: (v: unknown) => void) => r([]) };
}

function makeService(opts: { flipShape?: unknown } = {}) {
  const flipResult = opts.flipShape;
  const tx = {
    execute: jest.fn(async () => ({ rowCount: 1 })), // status guard: wins
    select: () => ({
      from: () => {
        const chain: Record<string, unknown> = {};
        chain.where = () => chain;
        chain.limit = () => chain;
        chain.then = (resolve: (v: unknown) => void) => resolve([]);
        return chain;
      },
    }),
    update: jest.fn((table: unknown) => ({
      set: () => ({
        where: () => ({
          then: (resolve: (v: unknown) => void) => {
            // The matches-table flip resolves the SHAPED result under test;
            // every other update (none on this minimal path) resolves [].
            resolve(table === matches ? flipResult : []);
          },
        }),
      }),
    })),
    insert: () => ({
      values: () => thenable(),
    }),
  };
  const db = {
    transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
    execute: jest.fn(async (query: unknown) => {
      const text = new PgDialect().sqlToQuery(query as never).sql;
      return text.includes("INTERVAL '60 minutes'") && text.includes('SELECT')
        ? [HELD_ROW]
        : [];
    }),
    select: () => ({
      from: () => {
        const chain: Record<string, unknown> = {};
        chain.where = () => chain;
        chain.limit = () => chain;
        chain.then = (resolve: (v: unknown) => void) => resolve([]);
        return chain;
      },
    }),
    query: { matches: { findFirst: async () => null } },
  };
  const svc = new MatchesService(
    db as never,
    {} as never, // walletService
    {} as never, // appGateway
    { sendPushToUsers: jest.fn(async () => undefined) } as never,
    { record: jest.fn(async () => undefined) } as never,
    {} as never, // settings
    {} as never, // realtime
    { promoteNextInTx: async () => null } as never
  );
  const loggerError = jest.spyOn(
    (svc as unknown as { logger: { error: (m: string) => void } }).logger,
    'error',
  );
  return { svc, tx, db, loggerError, captureException: Sentry.captureException as jest.Mock };
}

describe('payout-hold flip observability (run #229, PR #297 tier-B round)', () => {
  beforeEach(() => {
    (Sentry.captureException as jest.Mock).mockClear();
  });

  it('alerts on {rowCount: 0} (jest-mock driver shape)', async () => {
    const { svc, tx, loggerError, captureException } = makeService({
      flipShape: { rowCount: 0 },
    });
    await svc.checkMinPlayers();
    expect(tx.update).toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('host_payout_hold_lost_race'));
    expect(captureException).toHaveBeenCalledTimes(1);
    expect((captureException.mock.calls[0][1] as { tags: Record<string, string> }).tags.event).toBe(
      'host_payout_hold_lost_race',
    );
  });

  it('alerts on {count: 0} (prod postgres-js RowList shape)', async () => {
    const { svc, loggerError, captureException } = makeService({
      flipShape: { count: 0 },
    });
    await svc.checkMinPlayers();
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('host_payout_hold_lost_race'));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('stays SILENT on a shape-less result (optimistic default 1 = happy path)', async () => {
    const { svc, loggerError, captureException } = makeService({ flipShape: {} });
    await svc.checkMinPlayers();
    expect(loggerError).not.toHaveBeenCalledWith(
      expect.stringContaining('host_payout_hold_lost_race'),
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it('never touches the flip for a row that was never held', async () => {
    const row = { ...HELD_ROW, host_payout_state: 'not_applicable' };
    const { svc, tx, db } = makeService();
    db.execute.mockImplementation(async (query: unknown) => {
      const text = new PgDialect().sqlToQuery(query as never).sql;
      return text.includes("INTERVAL '60 minutes'") && text.includes('SELECT')
        ? [row]
        : [];
    });
    await svc.checkMinPlayers();
    const matchesUpdates = (tx.update as jest.Mock).mock.calls.filter(
      (c) => c[0] === matches,
    );
    expect(matchesUpdates).toHaveLength(0);
  });
});
