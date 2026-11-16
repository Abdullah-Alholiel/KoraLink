import { MatchesService } from './matches.service';
import {
  match_players,
  pitch_slots,
  transactions,
  users,
} from '../../database/schema';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * P0-4 (run #13): the underfill auto-cancel's refund path was NOT atomic —
 * the guarded `Cancelled` UPDATE committed FIRST, then wallet credit, ledger
 * insert and slot release ran as separate auto-committed statements inside a
 * try/catch that only logs. A failure after the guard left a cancelled match
 * with a permanently booked slot and a host who was never refunded (silent
 * money loss in an automated path — status no longer Open/Full, so no retry).
 *
 * The fix runs guard + refund + ledger + slot release inside ONE
 * `db.transaction`, mirroring manual `cancelMatch`. These specs prove:
 * every money/slot statement targets the tx (not the raw db), the ledger
 * keeps the `refund-<matchId>` idempotency key, a refund failure rolls the
 * whole cancellation back (no cancelled-but-unrefunded state, roster never
 * told "cancelled"), a lost guard race notifies nobody, and self-mode
 * matches still cancel + notify without touching wallet tables.
 */
describe('MatchesService.checkMinPlayers Pass 2 — atomic auto-cancel', () => {
  const EXPIRING_ROW = {
    id: 'match-1',
    title: 'Tuesday football',
    host_id: 'host-1',
    booking_mode: 'koralink',
    booking_slot_id: 'slot-1',
    pitch_cost_sar: '120.00',
    min_players: 8,
    total_players: 3,
  };

  const SELF_MODE_ROW = {
    ...EXPIRING_ROW,
    booking_mode: 'self',
    booking_slot_id: null,
    pitch_cost_sar: null,
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
   * The service iterates `db.execute(...)` results directly (postgres-js
   * RowList), so Pass 0/1 resolve [] and the Pass 2 SELECT (identified by its
   * `INTERVAL '60 minutes'` predicate) resolves the row under test.
   */
  function makeService(
    opts: {
      expiringRow?: unknown;
      refundFails?: boolean;
      guardRowCount?: number;
      vanishedUser?: boolean;
      raceConflict?: boolean;
    } = {},
  ) {
    const txCalls: CapturedCall[] = [];
    const order: string[] = [];

    const record = (op: string, table?: unknown, setArg?: Record<string, unknown>) => {
      txCalls.push({ op, table, setArg });
      order.push(op);
      return thenable();
    };

    const tx = {
      execute: jest.fn(async () => ({ rowCount: opts.guardRowCount ?? 1 })),
      // Slice 4: the payer-refund sweep reads match_players fee rows inside
      // the tx. Default fixture roster has NO fee snapshots (legacy rows) —
      // resolve []; the payer-refund scenario overrides below.
      select: () => ({
        from: () => {
          const chain: Record<string, unknown> = {};
          chain.where = () => chain;
          // P2-244: creditWalletTx's replay pre-select ends in .limit(1).
          chain.limit = () => chain;
          chain.then = (resolve: (v: unknown) => void) => resolve([]);
          return chain;
        },
      }),
      update: (table: unknown) => ({
        set: (setArg: Record<string, unknown>) => {
          // P2-244 (run #158): creditWalletTx awaits
          // `.where(...).returning(...)` (a plain array — the then-based
          // recorder never fired on that path), so record at returning()
          // call time with a once-guard; non-returning awaiters (the slot
          // release) still record via then.
          let recorded = false;
          const op =
            table === users ? 'tx:credit' : table === pitch_slots ? 'tx:slot' : 'tx:update';
          const rec = () => {
            if (!recorded) {
              recorded = true;
              record(op, table, setArg);
            }
          };
          return {
            where: () => ({
              returning: () => {
                rec();
                if (opts.vanishedUser && table === users) return [];
                return [{ wallet_balance: '120.00' }];
              },
              then: (resolve: (v: unknown) => void) => {
                rec();
                resolve(thenable());
              },
            }),
          };
        },
      }),
      insert: (table: unknown) => ({
        values: (valuesArg: Record<string, unknown>) => {
          txCalls.push({ op: 'tx:ledger', table, valuesArg });
          order.push('tx:ledger');
          if (opts.raceConflict) {
            const e = new Error(
              'duplicate key value violates unique constraint "transactions_idempotency_key_unique"',
            );
            (e as { code?: string }).code = '23505';
            throw e;
          }
          if (opts.refundFails) {
            throw new Error('ledger insert failed (simulated outage)');
          }
          return thenable();
        },
      }),
    };

    const db = {
      // Every Pass-2 statement MUST go through this transaction callback.
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
      execute: jest.fn(async (query: unknown) => {
        // drizzle SQL objects carry chunks, not a .sql string — serialize via
        // the dialect to identify the Pass-2 expiring SELECT.
        const text = new PgDialect().sqlToQuery(query as never).sql;
        return text.includes("INTERVAL '60 minutes'") && text.includes('SELECT')
          ? [opts.expiringRow ?? EXPIRING_ROW]
          : [];
      }),
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            order.push('post:select-roster');
            resolve(table === match_players ? [{ user_id: 'host-1' }, { user_id: 'p2' }] : []);
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
      {} as never, // walletService (unused on this path)
      {} as never, // appGateway
      { sendPushToUsers: sendPush } as never,
      { record: recordActivity } as never,
      {} as never, // settings
      {} as never, // realtime
      { promoteNextInTx: async () => null } as never
    );
    return { svc, tx, txCalls, order, db, recordActivity, sendPush };
  }

  it('runs the guarded cancel, refund, ledger and slot release inside ONE transaction', async () => {
    const { svc, txCalls, order, db, recordActivity } = makeService();

    const result = await svc.checkMinPlayers();

    expect(result.cancelled).toBe(1);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // All money/slot statements ran on the tx, in canonical order, and the
    // roster notification only fired after the transaction committed.
    // P2-244 (run #158): creditWalletTx inserts the IMMUTABLE ledger row
    // FIRST (the UNIQUE key is the concurrency gate), then the guarded
    // balance increment — so the recorded order is ledger → credit.
    expect(txCalls.map((c) => c.op)).toEqual(['tx:ledger', 'tx:credit', 'tx:slot']);
    expect(order).toEqual([
      'tx:ledger',
      'tx:credit',
      'tx:slot',
      'post:select-roster',
      'post:activity',
      'post:push',
      // P1-17: the waitlist check (empty queue → no-op) runs after the roster
      // notification, before the cancelled-counter log.
      'post:select-roster',
      // P2-193 (run #155): the refund push follows the roster push — money
      // events get a voice, still entirely post-commit (never inside the tx).
      'post:push',
    ]);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'match_auto_cancelled', matchId: EXPIRING_ROW.id }),
    );
  });

  it('credits the host and inserts the ledger entry with the refund-<matchId> idempotency key', async () => {
    const { svc, txCalls } = makeService();

    await svc.checkMinPlayers();

    const credit = txCalls.find((c) => c.op === 'tx:credit')!;
    expect(credit.table).toBe(users);
    expect(credit.setArg?.wallet_balance).toBeDefined(); // sql increment fragment
    expect(credit.setArg?.updated_at).toBeInstanceOf(Date);
    const ledger = txCalls.find((c) => c.op === 'tx:ledger')!;
    expect(ledger.table).toBe(transactions);
    expect(ledger.valuesArg).toMatchObject({
      user_id: 'host-1',
      type: 'CREDIT',
      // P2-244 (run #158): creditWalletTx persists amounts via toFixed(2).
      amount: '120.00',
      reference_type: 'REFUND',
      reference_id: 'match-1',
      idempotency_key: 'refund-match-1',
      status: 'Completed',
    });

    const slot = txCalls.find((c) => c.op === 'tx:slot')!;
    expect(slot.table).toBe(pitch_slots);
    expect(slot.setArg?.is_booked).toBe(false);
    expect(slot.setArg?.booked_match_id).toBeNull();
  });

  it('P2-244: vanished host user row → whole cancellation rolls back, nobody notified (clean 400, no partial credit)', async () => {
    const { svc, txCalls, recordActivity, sendPush } = makeService({ vanishedUser: true });

    const result = await svc.checkMinPlayers(); // catch logs; tx rolled back inside

    // The refund failure must abort BEFORE the slot release and before any
    // post-commit fan-out: cancelled=0, only the ledger insert + the failed
    // guarded credit ran (tx rolls back — nothing durable), roster never
    // told "cancelled".
    expect(result.cancelled).toBe(0);
    expect(txCalls.map((c) => c.op)).toEqual(['tx:ledger', 'tx:credit']);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('P2-244: concurrent same-key refund race (23505) → cancellation rolls back with a clean 409, never a raw 500', async () => {
    const { svc, txCalls, recordActivity, sendPush } = makeService({ raceConflict: true });

    const result = await svc.checkMinPlayers();

    // The replay pre-check passed (no prior row), the ledger INSERT hit the
    // UNIQUE key — creditWalletTx maps it to ConflictException and the caller
    // tx rolls back; the retry resolves via the pre-check (idempotent no-op).
    // The guarded balance UPDATE never ran (insert throws first).
    expect(result.cancelled).toBe(0);
    expect(txCalls.map((c) => c.op)).toEqual(['tx:ledger']);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('rolls the whole cancellation back when the refund fails — no "cancelled" notice to the roster', async () => {
    const { svc, recordActivity, sendPush } = makeService({ refundFails: true });

    const result = await svc.checkMinPlayers(); // catch logs; must NOT swallow a committed cancel

    expect(result.cancelled).toBe(0);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('notifies nobody when the guard loses the race (match cancelled concurrently)', async () => {
    const { svc, txCalls, recordActivity, sendPush } = makeService({ guardRowCount: 0 });

    const result = await svc.checkMinPlayers();

    expect(result.cancelled).toBe(0);
    expect(txCalls).toHaveLength(0); // no money/slot statements after a lost guard
    expect(recordActivity).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('cancels and notifies self-mode matches (no slot, no refund) without wallet statements', async () => {
    const { svc, txCalls, recordActivity, sendPush } = makeService({ expiringRow: SELF_MODE_ROW });

    const result = await svc.checkMinPlayers();

    expect(result.cancelled).toBe(1);
    expect(txCalls).toHaveLength(0); // guard UPDATE only — no credit/ledger/slot ops
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });
});
