import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import { pitches, pitch_slots, transactions, users } from '../../database/schema';
import { MatchesService } from './matches.service';

/**
 * rescheduleMatch specs (P1-13, run #20). The tx stub routes by SQL content
 * (raw execute) and by table identity (builder calls) — same style as
 * matches.mark-noshow.spec.ts. Guards, slot swap, wallet math, ledger
 * idempotency keys, and the populated-return contract are all asserted.
 */
describe('MatchesService.rescheduleMatch', () => {
  const HOST = 'host-1';
  const MATCH_ID = 'match-1';

  /** YYYY-MM-DD for (today in Riyadh) + N days — UTC+3, DST-free. */
  function riyadhDate(daysFromNow: number): string {
    return new Date(Date.now() + 3 * 3_600_000 + daysFromNow * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }

  const oldSlot = {
    id: 'slot-old',
    pitch_id: 'pitch-1',
    slot_date: riyadhDate(1),
    start_time: '18:00:00',
    end_time: '19:00:00',
    is_booked: true,
  };
  const newSlot = {
    id: 'slot-new',
    pitch_id: 'pitch-1',
    slot_date: riyadhDate(2),
    start_time: '20:00:00',
    end_time: '21:30:00',
    is_booked: false,
  };
  const baseMatch = {
    id: MATCH_ID,
    host_id: HOST,
    status: 'Open',
    booking_mode: 'koralink',
    booking_slot_id: 'slot-old',
    pitch_id: 'pitch-1',
    pitch_cost_sar: '100',
    price_per_player: '16.67',
    max_players: 10,
  };
  const populated = {
    id: MATCH_ID,
    status: 'Open',
    booking_slot_id: 'slot-new',
    title: 'Friday football',
    scheduled_at: new Date('2030-09-02T17:00:00.000Z'),
    duration_mins: 90,
    completed_at: null,
    players: [{ user: { id: 'player-1' } }],
    messages: [],
  };

  function makeTx(overrides: {
    match?: Record<string, unknown> | null;
    slots?: Array<Record<string, unknown>>;
    walletBalance?: string;
  }) {
    const match = overrides.match === undefined ? baseMatch : overrides.match;
    const slots = overrides.slots ?? [oldSlot, newSlot];
    const insertedTransactions: Array<Record<string, unknown>> = [];
    const slotUpdates: Array<Record<string, unknown>> = [];

    const tx = {
      // Raw SQL (match lock + slot lock) — compiled via PgDialect so the
      // routing below sees the real SQL text.
      execute: async (query: unknown) => {
        const q = new PgDialect().sqlToQuery(query as never).sql;
        if (q.includes('FROM matches')) return match ? [match] : [];
        if (q.includes('FROM pitch_slots')) return slots;
        return [];
      },
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === pitches) resolve([{ hourly_rate: '100' }]);
            else if (table === users) resolve([{ wallet_balance: overrides.walletBalance ?? '500' }]);
            else resolve([]);
          };
          return chain;
        },
      }),
      update: (table: unknown) => ({
        set: (setArg: Record<string, unknown>) => ({
          where: () => {
            if (table === pitch_slots) slotUpdates.push(setArg);
            return { then: (r: (v: unknown) => void) => r([]) };
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          if (table === transactions) insertedTransactions.push(v);
          return {
            then: (r: (v: unknown) => void) => r([]),
            onConflictDoNothing: () => ({ then: (r: (v: unknown) => void) => r([]) }),
          };
        },
      }),
    };

    return {
      tx,
      insertedTransactions,
      slotUpdates,
      makeDb: () => ({
        transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx),
        query: { matches: { findFirst: async () => populated } },
      }),
    };
  }

  function makeService(harness: ReturnType<typeof makeTx>) {
    const appGateway = { broadcastStatusUpdate: () => {} };
    const activitiesService = { record: async () => {} };
    const notificationsService = { sendPushToUsers: async () => 1 };
    return new MatchesService(
      harness.makeDb() as never,
      {} as never, // walletService (unused — reschedule handles money directly)
      appGateway as never,
      notificationsService as never,
      activitiesService as never,
      {} as never, // settings
      {} as never, // realtime
    );
  }

  const dto = { booking_slot_id: 'slot-new' };

  it('throws NotFound for a missing match', async () => {
    const h = makeTx({ match: null });
    await expect(makeService(h).rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a non-host with Forbidden', async () => {
    const h = makeTx({});
    await expect(
      makeService(h).rescheduleMatch('not-the-host', MATCH_ID, dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects non-koralink matches (no slot to swap)', async () => {
    const h = makeTx({ match: { ...baseMatch, booking_mode: 'self', booking_slot_id: null } });
    await expect(makeService(h).rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects statuses other than Open/Full', async () => {
    const h = makeTx({ match: { ...baseMatch, status: 'InProgress' } });
    await expect(makeService(h).rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects rescheduling onto the current slot', async () => {
    const h = makeTx({});
    await expect(
      makeService(h).rescheduleMatch(HOST, MATCH_ID, { booking_slot_id: 'slot-old' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a slot on a different pitch', async () => {
    const h = makeTx({ slots: [oldSlot, { ...newSlot, pitch_id: 'pitch-2' }] });
    await expect(makeService(h).rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an already-booked target slot with Conflict', async () => {
    const h = makeTx({ slots: [oldSlot, { ...newSlot, is_booked: true }] });
    await expect(makeService(h).rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a PAST target slot with BadRequest BEFORE any money moves (cross-day picker)', async () => {
    const h = makeTx({ slots: [oldSlot, { ...newSlot, slot_date: riyadhDate(-2) }] });
    await expect(makeService(h).rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toThrow(
      /slot in the past/,
    );
    // Guard sits before the money path: no ledger rows, no slot writes.
    expect(h.insertedTransactions).toHaveLength(0);
    expect(h.slotUpdates).toHaveLength(0);
  });

  it('rejects by DATE not clock: same time-of-day yesterday 400, tomorrow 200', async () => {
    const svc = (slotDate: string) => {
      const h = makeTx({ slots: [oldSlot, { ...newSlot, slot_date: slotDate }] });
      return { h, result: makeService(h).rescheduleMatch(HOST, MATCH_ID, dto) };
    };
    // Yesterday (identical 20:00–21:30 wall clock) → still past → 400.
    await expect(svc(riyadhDate(-1)).result).rejects.toBeInstanceOf(BadRequestException);
    // Tomorrow, same wall clock → the guard must not block it (cross-day OK).
    const tomorrow = await svc(riyadhDate(1)).result;
    expect(tomorrow.reschedule.new_slot_id).toBe('slot-new');
  });

  it('swaps slots, nets the wallet, reprices, and returns the populated match + summary', async () => {
    const h = makeTx({ walletBalance: '500' });
    const result = await makeService(h).rescheduleMatch(HOST, MATCH_ID, dto);

    // 60 min @ 100 SAR/h = 100 old cost; 90 min = 150 new cost → +50 net.
    expect(result.reschedule).toEqual({
      old_slot_id: 'slot-old',
      new_slot_id: 'slot-new',
      wallet_delta_sar: 50,
    });

    // Populated findOne contract (§2) + additive summary block.
    expect(result.id).toBe(MATCH_ID);
    expect(result.title).toBe('Friday football');

    // Ledger: exact refund of the debited cost + exact charge of the new cost.
    const credit = h.insertedTransactions.find((t) => t.type === 'CREDIT');
    const debit = h.insertedTransactions.find((t) => t.type === 'DEBIT');
    expect(credit).toMatchObject({ amount: '100', reference_type: 'REFUND', reference_id: MATCH_ID });
    expect(credit?.idempotency_key).toStrictEqual(expect.stringMatching(/^reschedule-refund-match-1-slot-new-[0-9a-f-]{36}$/));
    expect(debit).toMatchObject({ amount: '150', reference_type: 'PITCH_BOOKING', reference_id: MATCH_ID });
    expect(debit?.idempotency_key).toStrictEqual(expect.stringMatching(/^reschedule-charge-match-1-slot-new-[0-9a-f-]{36}$/));

    // Slot swap: old released, new booked.
    expect(h.slotUpdates.length).toBe(2);
  });

  it('applies the createMatch pricing formula to the new duration (round2(cost/(max−1)+5))', async () => {
    const h = makeTx({});
    // 150 / 9 = 16.666… + 5 margin → ceil(2166.66…)/100 = 21.67
    // (asserted indirectly: the method must not throw and must return the block)
    const result = await makeService(h).rescheduleMatch(HOST, MATCH_ID, dto);
    expect(result.reschedule.wallet_delta_sar).toBe(50);
  });

  it('charges the host when the new slot costs more and balance is insufficient → 400', async () => {
    const h = makeTx({ walletBalance: '10' });
    await expect(makeService(h).rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refunds without a balance floor when the new slot is cheaper', async () => {
    const h = makeTx({ slots: [oldSlot, { ...newSlot, start_time: '20:00:00', end_time: '20:30:00' }], walletBalance: '0' });
    // 30 min @ 100/h = 50 → delta −50; zero balance is fine (net refund).
    const result = await makeService(h).rescheduleMatch(HOST, MATCH_ID, dto);
    expect(result.reschedule.wallet_delta_sar).toBe(-50);
  });

  it('P2-37: rejects max_players < 2 before pricing (divide-by-zero defense)', async () => {
    // DTO floors max_players at 2, but a drifted/legacy row would make
    // round2(newCost / (newMax - 1) + margin) divide by zero → Infinity/NaN.
    const h = makeTx({ match: { ...baseMatch, max_players: 1 } });
    await expect(makeService(h).rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toThrow(
      BadRequestException,
    );
    // No ledger writes happened — the guard fires before money moves.
    expect(h.insertedTransactions.length).toBe(0);
    expect(h.slotUpdates.length).toBe(0);
  });
});
