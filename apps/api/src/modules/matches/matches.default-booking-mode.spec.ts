import { BadRequestException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import {
  matches,
  match_players,
  pitch_slots,
  pitches,
  transactions,
  users,
} from '../../database/schema';

/**
 * Product default for booking_mode (2026-09-04): hosting a match defaults to
 * the "Book via Us" (koralink) mode — in the PWA form, the client Zod schema,
 * the API service fallback (dto.booking_mode ?? …), the create-match
 * DTO/Swagger docs, AND the DB column default (migration 0032). These specs
 * pin the service-level behavior:
 *  - Omitted booking_mode → the koralink path runs (slot lock + wallet
 *    deduct + ledger + match row stamped booking_mode='koralink').
 *  - Explicit 'self' → no slot lock, no deduct, no ledger; row stamped 'self'.
 *  - Koralink without booking_slot_id → still a 400 (default never bypasses
 *    the slot requirement).
 */
describe('MatchesService.createMatch — default booking mode', () => {
  const HOST_ID = 'host-1';
  const SLOT_A = 'slot-A';
  const PITCH_ID = 'pitch-1';
  const COST = 80;

  const PITCH = {
    id: PITCH_ID,
    venueLocation: { type: 'Point', coordinates: [46.6, 24.7] },
    hourlyRate: '160.00', // 160 SAR/hr × 30 min = 80 SAR
  };

  const HOST = { id: HOST_ID, wallet_balance: '100.00' };

  interface CapturedCall {
    op: string;
    table?: unknown;
    setArg?: Record<string, unknown>;
    valuesArg?: Record<string, unknown>;
  }

  function makeTx() {
    const calls: CapturedCall[] = [];

    const update = (table: unknown) => ({
      set: (setArg: Record<string, unknown>) => ({
        where: (_whereClause: unknown) => ({
          returning: () => {
            const op = table === users ? 'deduct' : table === pitch_slots ? 'slot' : 'update';
            calls.push({ op, table, setArg });
            return table === users ? [{ wallet_balance: '20.00' }] : [{ id: 'match-1' }];
          },
        }),
      }),
    });

    const insert = (table: unknown) => ({
      values: (valuesArg: Record<string, unknown>) => {
        const op = table === matches ? 'match' : table === match_players ? 'player' : 'ledger';
        calls.push({ op, table, valuesArg });
        const ret: any = {};
        ret.returning = () => [{ id: 'match-1' }];
        ret.then = (r: (v: unknown) => void) => r([{ id: 'match-1' }]);
        return ret;
      },
    });

    const select = () => ({
      from: () => {
        const builder: any = {};
        builder.innerJoin = () => builder;
        builder.where = () => builder;
        builder.limit = async () => [];
        return builder;
      },
    });

    const execute = async (query: unknown) => {
      const { PgDialect } = await import('drizzle-orm/pg-core');
      const text = new PgDialect().sqlToQuery(query as never).sql;
      if (text.includes('SELECT id, is_booked FROM pitch_slots')) {
        calls.push({ op: 'slot-lock' });
        return [{ id: SLOT_A, is_booked: false }];
      }
      return [];
    };

    return { tx: { update, insert, execute, select }, calls };
  }

  function makeDb(tx: unknown) {
    const transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    const selectChain = (table: unknown) => {
      const isPitches = table === pitches;
      const builder: any = {};
      builder.innerJoin = () => builder;
      builder.where = () => builder;
      builder.limit = async () => (isPitches ? [PITCH] : []);
      builder.then = (resolve: (v: unknown) => void) => resolve([]);
      return builder;
    };

    return {
      transaction,
      select: () => ({ from: selectChain }),
      execute: async () => [],
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

  const baseDto = {
    pitch_id: PITCH_ID,
    title: 'Tuesday football',
    match_type: 'Casual' as const,
    gender_rule: 'Mixed' as const,
    scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
    duration_mins: 30,
    max_players: 10,
    visibility: 'public' as const,
  };

  it('treats an OMITTED booking_mode as koralink (slot lock + wallet + ledger)', async () => {
    const { tx, calls } = makeTx();
    const svc = makeService(makeDb(tx));

    await svc.createMatch(HOST_ID, { ...baseDto, booking_slot_id: SLOT_A });

    const matchInsert = calls.find((c) => c.op === 'match')!;
    expect(matchInsert).toBeDefined();
    expect(matchInsert.valuesArg).toMatchObject({
      booking_mode: 'koralink',
      booking_slot_id: SLOT_A,
    });

    // The koralink side effects must all have run.
    expect(calls.find((c) => c.op === 'slot-lock')).toBeDefined();
    expect(calls.find((c) => c.op === 'deduct')).toBeDefined();
    const ledger = calls.find((c) => c.op === 'ledger')!;
    expect(ledger.valuesArg).toMatchObject({
      user_id: HOST_ID,
      type: 'DEBIT',
      amount: '80',
      reference_type: 'PITCH_BOOKING',
      reference_id: SLOT_A,
      status: 'Completed',
    });
  });

  it('keeps an explicit self mode on the self path (no lock, no deduct, no ledger)', async () => {
    const { tx, calls } = makeTx();
    const svc = makeService(makeDb(tx));

    await svc.createMatch(HOST_ID, { ...baseDto, booking_mode: 'self' });

    const matchInsert = calls.find((c) => c.op === 'match')!;
    expect(matchInsert.valuesArg).toMatchObject({
      booking_mode: 'self',
      booking_slot_id: null,
    });
    expect(calls.find((c) => c.op === 'slot-lock')).toBeUndefined();
    expect(calls.find((c) => c.op === 'deduct')).toBeUndefined();
    expect(calls.find((c) => c.op === 'ledger')).toBeUndefined();
  });

  it('still requires booking_slot_id when koralink is (or defaults to) the mode', async () => {
    const { tx, calls } = makeTx();
    const svc = makeService(makeDb(tx));

    // booking_mode omitted → koralink default → slot is mandatory.
    await expect(svc.createMatch(HOST_ID, { ...baseDto })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(calls.find((c) => c.op === 'match')).toBeUndefined();
  });
});
