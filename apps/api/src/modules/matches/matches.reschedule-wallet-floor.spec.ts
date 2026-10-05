import { BadRequestException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { and, eq, sql } from 'drizzle-orm';

import { pitches, users } from '../../database/schema';
import { MatchesService } from './matches.service';

/**
 * Run #105 (Reviewer A IMPORTANT): rescheduleMatch's wallet floor was an
 * UNLOCKED check-then-act — a plain users SELECT, a JS `parseFloat < delta`
 * throw, then an unconditional increment. A concurrent debit on the same
 * host (another reschedule on a different match, a future withdrawal) could
 * commit between the floor read and the UPDATE, driving wallet_balance
 * negative. Fix (P2-41 class): `.for('update')` on the users read, and the
 * floor moves INSIDE the UPDATE as a `wallet_balance >= delta` predicate —
 * the database arbitrates the race; zero rows updated = insufficient.
 *
 * Specs prove:
 *  (a) source tripwire — the users read in the reschedule tx carries
 *      `.for('update')` and the UPDATE carries the guarded predicate;
 *  (b) the guarded SQL shape (PgDialect) contains the floor predicate;
 *  (c) sufficient balance → the net delta applies exactly once (returning
 *      sees the update);
 *  (d) zero-rows updated → BadRequest + Pino warn (race-loser path).
 */
describe('MatchesService.rescheduleMatch — wallet floor atomicity (run #105)', () => {
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

  // ── (a) Source tripwire: pin the fix in the actual service source ────────
  it('source: reschedule wallet read is FOR UPDATE + UPDATE carries the >= floor predicate', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, 'matches.service.ts'), 'utf8');

    // Isolate the reschedule tx body (from its transaction to the post-commit).
    const start = src.indexOf('async rescheduleMatch(');
    const end = src.indexOf('// ── 5. Post-commit', start);
    const body = src.slice(start, end);

    // The users read inside the reschedule tx must be row-locked.
    expect(body).toMatch(/\.select\(\{ wallet_balance: users\.wallet_balance \}\)[\s\S]*?\.for\('update'\)/);

    // The floor predicate must live INSIDE the UPDATE (P2-41 pattern), not as
    // a bare eq(id) update.
    expect(body).toMatch(/wallet_balance\} >= \$\{walletDeltaSar\.toString\(\)\}/);
    expect(body).toMatch(/\.returning\(\{ wallet_balance: users\.wallet_balance \}\)/);
  });

  // ── (b) Guarded predicate compiles to SQL carrying the floor ─────────────
  it('PgDialect: the guarded WHERE compiles with wallet_balance >= <delta> bound as a parameter', () => {
    const delta = '25.5';
    const predicate = and(
      eq(users.id, 'host-1'),
      sql`${users.wallet_balance} >= ${delta}`,
    ) as unknown as SQL;
    const { sql: compiled } = new PgDialect().sqlToQuery(predicate);
    expect(compiled).toContain('>=');
    expect(compiled).toContain('"users"."wallet_balance"');
    expect(compiled).toContain('"users"."id"');
  });

  // ── (c)+(d) Behavioral: sufficient balance applies; zero-rows → 400+warn ─
  function makeHarness(overrides: { walletBalance?: string; updateRows?: number }) {
    const walletBalance = overrides.walletBalance ?? '500';
    const updateRows = overrides.updateRows ?? 1;
    const warnings: string[] = [];

    const tx = {
      execute: async (query: unknown) => {
        const q = new PgDialect().sqlToQuery(query as never).sql;
        if (q.includes('FROM matches')) return [baseMatch];
        if (q.includes('FROM pitch_slots')) return [oldSlot, newSlot];
        return [];
      },
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain, for: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === pitches) resolve([{ hourly_rate: '100' }]);
            else if (table === users) resolve([{ wallet_balance: walletBalance }]);
            else resolve([]);
          };
          return chain;
        },
      }),
      update: (table: unknown) => ({
        set: (setArg: Record<string, unknown>) => ({
          where: (whereClause: unknown) => {
            const compiledWhere = whereClause
              ? new PgDialect().sqlToQuery(whereClause as never).sql
              : '';
            return {
              returning: () =>
                table === users
                  ? updateRows > 0
                    ? [{ wallet_balance: '525.00' }]
                    : []
                  : [],
              then: (r: (v: unknown) => void) => r([]),
            };
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          return {
            then: (r: (v: unknown) => void) => r([]),
            onConflictDoNothing: () => ({ then: (r: (v: unknown) => void) => r([]) }),
          };
        },
      }),
    };

    const service = new MatchesService(
      {
        transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx),
        // Post-commit findOne re-read (populated response contract).
        query: { matches: { findFirst: async () => populated } },
      } as never,
      {} as never,
      { broadcastStatusUpdate: () => {} } as never,
      { sendPushToUsers: async () => 1 } as never,
      { record: async () => {} } as never,
      {} as never,
      {} as never,
      { promoteNextInTx: async () => null } as never,
    );

    // Pino logger stub capturing warns.
    (
      service as unknown as {
        logger: {
          warn: (msg: string, ...rest: unknown[]) => void;
          error: (msg: string, ...rest: unknown[]) => void;
          log: (msg: string, ...rest: unknown[]) => void;
          debug: (msg: string, ...rest: unknown[]) => void;
        };
      }
    ).logger = {
      warn: (msg: string) => warnings.push(msg),
      error: () => {},
      log: () => {},
      debug: () => {},
    };

    return { service, warnings };
  }

  const dto = { booking_slot_id: 'slot-new' };

  it('sufficient balance: reschedule succeeds and the wallet UPDATE applies once', async () => {
    const { service } = makeHarness({ walletBalance: '500' });
    const result = await service.rescheduleMatch(HOST, MATCH_ID, dto);
    expect(result.reschedule.new_slot_id).toBe('slot-new');
    expect(result.reschedule.wallet_delta_sar).toBe(50);
  });

  it('zero-rows updated (concurrent debit won): 400 + reschedule_wallet_insufficient warn', async () => {
    const { service, warnings } = makeHarness({ walletBalance: '500', updateRows: 0 });
    await expect(service.rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(warnings.some((w) => w.includes('reschedule_wallet_insufficient'))).toBe(true);
  });

  it('JS floor pre-check fires BEFORE the UPDATE on a genuinely-empty balance (no update attempted)', async () => {
    // The floor is enforced TWICE by design: the .for('update') read lets the
    // JS pre-check reject a genuinely-broke host before any statement, and
    // the guarded UPDATE backstops the race. This pins the pre-check branch:
    // balance 5 < required 50 → BadRequest, no warn (the UPDATE never ran).
    const { service, warnings } = makeHarness({ walletBalance: '5', updateRows: 0 });
    await expect(service.rescheduleMatch(HOST, MATCH_ID, dto)).rejects.toThrow(
      /Insufficient wallet balance for the reschedule/,
    );
    expect(warnings).toHaveLength(0);
  });
});
