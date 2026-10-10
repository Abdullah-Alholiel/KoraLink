import { BadRequestException, ConflictException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PgDialect } from 'drizzle-orm/pg-core';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import {
  matches,
  match_players,
  pitch_slots,
  pitches,
  transactions,
  users,
} from '../../database/schema';

/**
 * P1-64 — recurring matches for players.
 *
 * A koralink host may book the same pitch + start_time for N consecutive
 * weeks (repeat_weeks 2..8). The service resolves every weekly slot up front
 * (one candidates query), names the FIRST failing date in date order, and
 * books all N inside ONE transaction — each slot gets its own match, its own
 * guarded wallet debit, and its own `slot-booking-<slotId>` ledger key.
 */

const VALID_BASE = {
  pitch_id: 'pitch-1',
  title: 'Weekly football',
  match_type: 'Casual',
  gender_rule: 'Mixed',
  scheduled_at: '2099-01-01T20:00:00+03:00',
  duration_mins: 60,
  max_players: 14,
};

function errorsFor(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(CreateMatchDto, payload)).filter(
    (e) => e.property === 'repeat_weeks',
  );
}

describe('CreateMatchDto.repeat_weeks (P1-64)', () => {
  it.each([2, 8])('accepts repeat_weeks=%i', (n) => {
    expect(errorsFor({ ...VALID_BASE, repeat_weeks: n })).toHaveLength(0);
  });

  it.each([0, 9])('rejects repeat_weeks=%i', (n) => {
    expect(errorsFor({ ...VALID_BASE, repeat_weeks: n })).toHaveLength(1);
  });

  it('is optional (omitted = single match)', () => {
    expect(errorsFor({ ...VALID_BASE })).toHaveLength(0);
  });
});

describe('MatchesService.createMatch — recurring weekly booking (P1-64)', () => {
  const HOST_ID = 'host-1';
  const PITCH_ID = 'pitch-1';
  const ANCHOR = { id: 'slot-w1', pitch_id: PITCH_ID, slot_date: '2099-01-01', start_time: '20:00:00' };

  const PITCH = {
    id: PITCH_ID,
    venueLocation: { type: 'Point', coordinates: [46.6, 24.7] },
    hourlyRate: '160.00', // 160 SAR/hr × 60 min = 160 SAR per week
    size: '7v7',
  };

  type Slot = { id: string; slot_date: string; start_time: string; is_booked: boolean };

  const dialect = new PgDialect();
  const sqlText = (q: unknown) => dialect.sqlToQuery(q as never).sql;

  function makeDb(candidates: Slot[], opts: { deductFail?: boolean } = {}) {
    const calls: { op: string; table?: unknown; valuesArg?: Record<string, unknown> }[] = [];
    let matchSeq = 0;

    const tx = {
      execute: async (q: unknown) => {
        // Lock statement: return every candidate (nothing changed under lock).
        if (/FOR UPDATE/.test(sqlText(q))) {
          calls.push({ op: 'lock' });
          return candidates;
        }
        return [];
      },
      insert: (table: unknown) => ({
        values: (valuesArg: Record<string, unknown>) => {
          const op = table === matches ? 'match' : table === match_players ? 'player' : table === transactions ? 'ledger' : 'insert';
          calls.push({ op, table, valuesArg });
          const id = `match-${++matchSeq}`;
          const ret: any = {};
          ret.returning = async () => [{ id }];
          ret.then = (r: (v: unknown) => void) => r([{ id }]);
          return ret;
        },
      }),
      update: (table: unknown) => ({
        set: (setArg: Record<string, unknown>) => ({
          where: () => {
            const op = table === users ? 'deduct' : table === pitch_slots ? 'slot' : 'update';
            calls.push({ op, table, valuesArg: setArg });
            const ret: any = {};
            ret.returning = async () =>
              table === users
                ? opts.deductFail
                  ? []
                  : [{ wallet_balance: '1000.00' }]
                : [];
            ret.then = (r: (v: unknown) => void) => r(undefined);
            return ret;
          },
        }),
      }),
      select: () => ({
        from: () => {
          const b: any = {};
          b.where = () => b;
          b.limit = async () => [{ wallet_balance: '0.00' }];
          return b;
        },
      }),
    };

    const db = {
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
      execute: async (q: unknown) => {
        const text = sqlText(q);
        if (/WHERE id = /.test(text)) return [ANCHOR];
        if (/slot_date IN/.test(text)) return candidates;
        return [];
      },
      select: () => ({
        from: (table: unknown) => {
          const b: any = {};
          b.innerJoin = () => b;
          b.where = () => b;
          b.limit = async () => (table === pitches ? [PITCH] : table === users ? [{ role: 'Player', wallet_balance: '499.99' }] : []);
          b.then = (r: (v: unknown) => void) => r([]);
          return b;
        },
      }),
      query: {
        matches: {
          findFirst: async () => ({
            id: 'match-1',
            host_id: HOST_ID,
            pitch_id: PITCH_ID,
            booking_mode: 'koralink',
            booking_slot_id: ANCHOR.id,
            status: 'Open',
            scheduled_at: new Date('2099-01-01T17:00:00Z'),
            duration_mins: 60,
            max_players: 14,
            price_per_player: 10,
            gender_rule: 'Mixed',
            match_type: 'Casual',
            visibility: 'public',
            host: { id: HOST_ID, full_name: 'Test Host', avatar_url: null },
            pitch: { id: PITCH_ID, name: 'Pitch 1', size: '7v7' },
            venue: { id: 'v1', name: 'Test Venue', city: 'Riyadh', location: null },
            players: [],
            match_players: [],
          }),
        },
      },
    };
    return { db, calls };
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
      { promoteNextInTx: async () => null } as never,
    );
  }

  const input = (over: Record<string, unknown> = {}) => ({
    ...VALID_BASE,
    match_type: 'Casual' as const,
    gender_rule: 'Mixed' as const,
    acceptedHostingTerms: true,
    booking_mode: 'koralink' as const,
    booking_slot_id: ANCHOR.id,
    visibility: 'public' as const,
    ...over,
  });

  const slot = (id: string, date: string, is_booked = false): Slot => ({
    id,
    slot_date: date,
    start_time: '20:00:00',
    is_booked,
  });

  it('names the conflicting date when the week-2 slot is already booked', async () => {
    const { db, calls } = makeDb([
      slot('slot-w1', '2099-01-01'),
      slot('slot-w2', '2099-01-08', true),
      slot('slot-w3', '2099-01-15'),
    ]);
    const svc = makeService(db);

    const err = await svc.createMatch(HOST_ID, input({ repeat_weeks: 3 })).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe('Slot on 2099-01-08 is already booked.');
    // Nothing written — resolution fails before the transaction opens.
    expect(db.transaction).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('names the missing date when a target week has no slot', async () => {
    const { db } = makeDb([
      slot('slot-w1', '2099-01-01'),
      slot('slot-w2', '2099-01-08'),
      // week 3 (2099-01-15) missing
      slot('slot-w4', '2099-01-22'),
    ]);
    const svc = makeService(db);

    const err = await svc.createMatch(HOST_ID, input({ repeat_weeks: 4 })).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('No slot available on 2099-01-15 for a weekly repeat.');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects repeat_weeks > 1 in self booking mode', async () => {
    const { db } = makeDb([]);
    const svc = makeService(db);

    const err = await svc
      .createMatch(HOST_ID, input({ booking_mode: 'self', booking_slot_id: undefined, repeat_weeks: 2 }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe('Recurring matches require KoraLink booking.');
  });

  it('books every week with a PER-SLOT ledger key and returns the first instance', async () => {
    const weeks = [
      slot('slot-w1', '2099-01-01'),
      slot('slot-w2', '2099-01-08'),
      slot('slot-w3', '2099-01-15'),
      slot('slot-w4', '2099-01-22'),
    ];
    const { db, calls } = makeDb(weeks);
    const svc = makeService(db);

    const res = await svc.createMatch(HOST_ID, input({ repeat_weeks: 4 }));
    expect(res.id).toBe('match-1');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.op === 'lock')).toHaveLength(1);

    const ledger = calls.filter((c) => c.op === 'ledger');
    expect(ledger.map((c) => c.valuesArg?.idempotency_key)).toEqual(
      weeks.map((w) => `slot-booking-${w.id}`),
    );
    expect(ledger.every((c) => c.valuesArg?.amount === '160')).toBe(true);
    expect(calls.filter((c) => c.op === 'deduct')).toHaveLength(4);
    expect(calls.filter((c) => c.op === 'slot')).toHaveLength(4);
    expect(calls.filter((c) => c.op === 'player')).toHaveLength(4);

    // Each instance is scheduled from ITS slot (Riyadh +03:00).
    const scheduled = calls
      .filter((c) => c.op === 'match')
      .map((c) => (c.valuesArg?.scheduled_at as Date).toISOString());
    expect(scheduled).toEqual([
      '2099-01-01T17:00:00.000Z',
      '2099-01-08T17:00:00.000Z',
      '2099-01-15T17:00:00.000Z',
      '2099-01-22T17:00:00.000Z',
    ]);
  });

  it('rejects an anchor slot from a DIFFERENT pitch (financial-integrity guard, PR-Agent)', async () => {
    const { db } = makeDb([]);
    const svc = makeService(db);

    const err = await svc.createMatch(HOST_ID, input({ repeat_weeks: 2 })).catch((e) => e);
    // The mocked anchor carries pitch_id PITCH_ID; price a DIFFERENT pitch.
    const cross = await svc
      .createMatch(HOST_ID, { ...input({ repeat_weeks: 2 }), pitch_id: 'pitch-other' })
      .catch((e) => e);
    expect(cross).toBeInstanceOf(BadRequestException);
    expect(cross.message).toBe('Slot does not belong to this pitch.');
    expect(db.transaction).not.toHaveBeenCalled();
    void err;
  });

  it('reports the TOTAL requirement (not one week) when a weekly debit fails', async () => {
    const { db, calls } = makeDb(
      [
        slot('slot-w1', '2099-01-01'),
        slot('slot-w2', '2099-01-08'),
        slot('slot-w3', '2099-01-15'),
        slot('slot-w4', '2099-01-22'),
      ],
      { deductFail: true },
    );
    const svc = makeService(db);

    const err = await svc.createMatch(HOST_ID, input({ repeat_weeks: 4 })).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    // Total + per-week + failing week number, in parser-compatible shape.
    expect(err.message).toContain('for 4 weekly bookings');
    expect(err.message).toContain('Required: SAR 640.00');
    expect(err.message).toContain('160.00/week × 4');
    expect(err.message).toContain('week 1 failed');
    expect(err.message).toContain('Available: SAR 499.99');
    // PWA parser contract must keep working (Required:/Available: extracts).
    expect(err.message).toMatch(/Insufficient wallet balance/i);
    expect(err.message).toMatch(/Required:\s*SAR\s*640\.00/);
    // Nothing persisted — the failing debit threw inside the tx.
    expect(calls.filter((c) => c.op === 'ledger')).toHaveLength(0);
  });
});
