import { BadRequestException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import {
  follows,
  matches,
  match_players,
  pitch_slots,
  pitches,
  transactions,
  users,
  venues,
} from '../../database/schema';

/**
 * Run #25 (Reviewer A IMPORTANT #1): the koralink booking path at
 * matches.service.ts:1247-1280 used a plain SELECT-then-UPDATE for the host
 * wallet. Two concurrent koralink match creations by the same host (two
 * different slots, each blocked only by its own slot row lock) could both
 * read the same wallet balance, both pass the check, and both subtract —
 * driving wallet_balance negative. The fix moves the integrity guard INSIDE
 * the row update: a conditional `UPDATE ... WHERE wallet_balance >= cost`
 * returns 0 rows when the predicate fails, which the service treats as
 * "insufficient balance" (re-reads for the error message, throws 400). This
 * is the same fix class as P0-4 (run #13) and P2-39 (run #22): let the
 * database enforce the predicate, not the application.
 *
 * These specs prove the three relevant branches:
 *  - Self mode: no deduct, no ledger, no wallet guard touched.
 *  - Koralink with sufficient balance: deduct updates 1 row, ledger inserted.
 *  - Koralink with insufficient balance: deduct updates 0 rows, ledger
 *    NEVER inserted (was the bug's other half — losing the race still
 *    inserted a duplicate ledger row), 400 thrown with the original message.
 *  - Concurrent same-host, two different slots: only one deduct wins; the
 *    other sees `wallet_balance >= cost` as false and throws 400.
 */
describe('MatchesService.createMatch — koralink booking wallet TOCTOU', () => {
  const HOST_ID = 'host-1';
  const SLOT_A = 'slot-A';
  const SLOT_B = 'slot-B';
  const PITCH_ID = 'pitch-1';
  const COST = 80;

  const PITCH = {
    id: PITCH_ID,
    venueLocation: { type: 'Point', coordinates: [46.6, 24.7] },
    hourlyRate: '160.00', // 160 SAR/hr × 30 min = 80 SAR
  };

  const HOST = { id: HOST_ID, wallet_balance: '100.00' };
  const HOST_BROKE = { id: HOST_ID, wallet_balance: '50.00' };

  interface CapturedCall {
    op: string;
    table?: unknown;
    setArg?: Record<string, unknown>;
    valuesArg?: Record<string, unknown>;
    whereSql?: string;
  }

  function makeTx(args: {
    deductRows: number;
    remainingBalance: string;
  }) {
    const calls: CapturedCall[] = [];
    const order: string[] = [];

    const update = (table: unknown) => ({
      set: (setArg: Record<string, unknown>) => ({
        where: (whereClause: unknown) => ({
          returning: () => {
            const op = table === users ? 'deduct' : table === pitch_slots ? 'slot' : 'update';
            calls.push({ op, table, setArg });
            order.push(op);
            return args.deductRows > 0 && table === users
              ? [{ wallet_balance: args.remainingBalance }]
              : table === users
                ? []
                : [{ id: 'match-1' }];
          },
        }),
      }),
    });

    const insert = (table: unknown) => ({
      values: (valuesArg: Record<string, unknown>) => {
        const op = table === matches ? 'match' : table === match_players ? 'player' : 'ledger';
        calls.push({ op, table, valuesArg });
        order.push(op);
        const ret: any = {};
        ret.returning = () => [{ id: 'match-1' }];
        ret.then = (r: (v: unknown) => void) => r([{ id: 'match-1' }]);
        return ret;
      },
    });

    // tx.select — used by the post-fail re-read (zero-rows deduct path)
    // and by any other in-tx lookup the service may add. Returns [] by
    // default; tests that need a specific value can override.
    const select = () => ({
      from: (table: unknown) => {
        const builder: any = {};
        builder.innerJoin = () => builder;
        builder.where = () => builder;
        builder.limit = async () => (table === users ? [{ wallet_balance: '50.00' }] : []);
        return builder;
      },
    });

    const execute = async (query: unknown) => {
      // Slot FOR UPDATE: synthesize based on the slot id in the SQL.
      const { PgDialect } = await import('drizzle-orm/pg-core');
      const text = new PgDialect().sqlToQuery(query as never).sql;
      if (text.includes('SELECT id, is_booked FROM pitch_slots')) {
        return [{ id: SLOT_A, is_booked: false }];
      }
      return [];
    };

    return { tx: { update, insert, execute, select }, calls, order };
  }

  function makeDb(tx: unknown, hostRow: { id: string; wallet_balance: string }) {
    // The outer db only does the pitch lookup and the post-update balance
    // re-read (the failed-deduct path). The createMatch body wraps the rest
    // in db.transaction(cb) which we capture and call synchronously.
    const transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    const selectChain = (table: unknown) => {
      const isPitches = table === pitches;
      const isUsers = table === users;
      const isVenues = table === venues;
      const isFollows = table === follows;
      // createMatch: .from(table).innerJoin(...).where(...).limit(1)
      // post-fail re-read: .from(table).where(...).limit(1)
      // post-success: .from(table).where(...)  (follows — NO limit)
      const builder: any = {};
      builder.innerJoin = () => builder;
      builder.where = () => builder;
      builder.limit = async () =>
        isPitches
          ? [PITCH]
          : isUsers
            ? [hostRow]
            : isVenues
              ? [{}]
              : [];
      // When `.where(...)` is awaited (no .limit), return [] for follows.
      // The chain is also awaitable directly via thenable.
      builder.then = (resolve: (v: unknown) => void) => {
        if (isFollows) resolve([]);
        else resolve([]);
      };
      return builder;
    };
    return {
      transaction,
      select: () => ({ from: selectChain }),
      execute: async (query: unknown) => {
        // The slot FOR UPDATE lives inside the tx.execute path; not called
        // from the outer db. Return [].
        return [];
      },
      // findOne is called OUTSIDE the transaction (matches.service.ts:1318).
      // Returns a minimal populated row that satisfies any downstream code.
      query: {
        matches: {
          findFirst: async () => ({
            id: 'match-1',
            host_id: HOST_ID,
            pitch_id: PITCH_ID,
            booking_mode: 'koralink',
            booking_slot_id: SLOT_A,
            status: 'Open',
            scheduled_at: new Date(),
            duration_mins: 30,
            max_players: 10,
            price_per_player: 10,
            gender_rule: 'Mixed',
            match_type: 'Casual',
            visibility: 'public',
            host: { id: HOST_ID, full_name: 'Test Host', avatar_url: null },
            pitch: { id: PITCH_ID, name: 'Pitch 1', size: '7v7' },
            venue: { id: 'v1', name: 'Test Venue', city: 'Riyadh', location: null },
            players: [],
            _count: { players: 1 },
            match_players: [],
          }),
        },
      },
    };
  }

  function makeService(db: unknown) {
    return new MatchesService(
      db as never,
      {} as never, // walletService
      {} as never, // appGateway
      { sendPushToUsers: async () => 0 } as never,
      { record: async () => undefined } as never,
      { getNumber: async (_k: string, fb: number) => fb } as never, // settings
      {} as never, // realtime
    );
  }

  it('deducts and inserts a ledger row when the koralink host can cover the cost', async () => {
    const { tx, calls, order } = makeTx({ deductRows: 1, remainingBalance: '20.00' });
    const db = makeDb(tx, HOST);
    const svc = makeService(db);

    await svc.createMatch(HOST_ID, {
      pitch_id: PITCH_ID,
      title: 'Tuesday football',
      match_type: 'Casual',
      gender_rule: 'Mixed',
      scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      duration_mins: 30,
      max_players: 10,
      booking_mode: 'koralink',
      booking_slot_id: SLOT_A,
      visibility: 'public',
    });

    // The deduct must run on the tx (not the raw db), and the ledger
    // insert must follow the successful deduct.
    const deductCall = calls.find((c) => c.op === 'deduct')!;
    expect(deductCall).toBeDefined();
    expect(deductCall.table).toBe(users);
    expect(deductCall.setArg?.wallet_balance).toBeDefined();

    const ledger = calls.find((c) => c.op === 'ledger')!;
    expect(ledger).toBeDefined();
    expect(ledger.table).toBe(transactions);
    expect(ledger.valuesArg).toMatchObject({
      user_id: HOST_ID,
      type: 'DEBIT',
      amount: '80',
      reference_type: 'PITCH_BOOKING',
      reference_id: SLOT_A,
      idempotency_key: `slot-booking-${SLOT_A}`,
      status: 'Completed',
    });

    // Sanity: the deduct ran BEFORE the ledger insert.
    expect(order.indexOf('deduct')).toBeLessThan(order.indexOf('ledger'));
  });

  it('throws 400 and inserts NO ledger row when the koralink host cannot cover the cost', async () => {
    // The deduct returns 0 rows — the conditional `wallet_balance >= cost`
    // predicate failed.
    const { tx, calls } = makeTx({ deductRows: 0, remainingBalance: '50.00' });
    const db = makeDb(tx, HOST_BROKE);
    const svc = makeService(db);

    await expect(
      svc.createMatch(HOST_ID, {
        pitch_id: PITCH_ID,
        title: 'Tuesday football',
        match_type: 'Casual',
        gender_rule: 'Mixed',
        scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
        duration_mins: 30,
        max_players: 10,
        booking_mode: 'koralink',
        booking_slot_id: SLOT_A,
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The deduct ran (zero rows), the ledger MUST NOT have been inserted.
    const deductCall = calls.find((c) => c.op === 'deduct');
    expect(deductCall).toBeDefined();
    expect(calls.find((c) => c.op === 'ledger')).toBeUndefined();
  });

  it('lets only one of two concurrent same-host koralink bookings win the wallet', async () => {
    // Simulate the race: same host, two different slots, each gets its own
    // tx. The first deduct wins (1 row updated, balance 100→20). The second
    // deduct sees the new balance and the `>= 80` predicate fails (0 rows).
    const { tx: txA } = makeTx({ deductRows: 1, remainingBalance: '20.00' });
    const dbA = makeDb(txA, HOST);
    const svcA = makeService(dbA);

    await svcA.createMatch(HOST_ID, {
      pitch_id: PITCH_ID,
      title: 'First booking',
      match_type: 'Casual',
      gender_rule: 'Mixed',
      scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      duration_mins: 30,
      max_players: 10,
      booking_mode: 'koralink',
      booking_slot_id: SLOT_A,
      visibility: 'public',
    });

    // Second tx: the host's balance is now 20 SAR (the previous booking
    // debited 80 from 100). 20 < 80, so the deduct returns 0 rows.
    const { tx: txB, calls: callsB } = makeTx({ deductRows: 0, remainingBalance: '20.00' });
    const dbB = makeDb(txB, { id: HOST_ID, wallet_balance: '20.00' });
    const svcB = makeService(dbB);

    await expect(
      svcB.createMatch(HOST_ID, {
        pitch_id: PITCH_ID,
        title: 'Second booking',
        match_type: 'Casual',
        gender_rule: 'Mixed',
        scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
        duration_mins: 30,
        max_players: 10,
        booking_mode: 'koralink',
        booking_slot_id: SLOT_B,
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // No ledger row for the loser.
    expect(callsB.find((c) => c.op === 'ledger')).toBeUndefined();
  });

  it('self-mode bookings do not touch the wallet (koralink guard inactive)', async () => {
    // Self mode: pitchCostSar is 0 (no slot rental), the entire `if
    // (pitchCostSar > 0)` block is skipped — no deduct, no ledger.
    const { tx, calls } = makeTx({ deductRows: 0, remainingBalance: '0.00' });
    const db = makeDb(tx, HOST);
    const svc = makeService(db);

    await svc.createMatch(HOST_ID, {
      pitch_id: PITCH_ID,
      title: 'Self-mode booking',
      match_type: 'Casual',
      gender_rule: 'Mixed',
      scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      duration_mins: 30,
      max_players: 10,
      booking_mode: 'self',
      visibility: 'public',
    });

    expect(calls.find((c) => c.op === 'deduct')).toBeUndefined();
    expect(calls.find((c) => c.op === 'ledger')).toBeUndefined();
    // But the match row and the host's roster slot were both inserted.
    expect(calls.find((c) => c.op === 'match')).toBeDefined();
    expect(calls.find((c) => c.op === 'player')).toBeDefined();
  });
});
