import { PgDialect } from 'drizzle-orm/pg-core';
import { UsersService } from './users.service';
import { matches } from '../../database/schema';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';

/**
 * Games-played completed-only rule (owner directive, 2026-09-10).
 *
 * A game counts as "played" ONLY when matches.status = 'Completed'.
 * Booking/hosting/joining a match that is not yet completed, was cancelled,
 * or is reported-not-played and cancelled afterwards must NEVER increment
 * the counter. Both counters are computed LIVE from match status (no stored
 * column), so correcting the query also retroactively fixes existing
 * profiles — Abdullah's production profile was the original report.
 *
 * Like the PDPL specs, these are WHERE-clause TRIPWIRES: the stub DB
 * captures every `select().from()[.innerJoin()].where()` chain and pins
 * (a) the `innerJoin(matches, matches.id = match_players.match_id)` shape
 * and (b) the `matches.status = 'Completed'` filter, so dropping either
 * (the original bug) fails the spec.
 */
describe('UsersService games_played completed-only rule', () => {
  const dialect = new PgDialect();

  function makeService(db: unknown) {
    const jwt = {
      sign: (payload: object) => `signed.${JSON.stringify(payload)}.sig`,
    } as unknown as JwtService;
    const config = {
      get: (_k: string, d?: string) => d,
    } as unknown as ConfigService;
    return new UsersService(db as never, jwt, config);
  }

  interface Captured {
    join: { table: unknown; on: string } | null;
    where: string;
    params: unknown[];
  }

  /**
   * Stub DB: every select chain pushes one Captured entry (in call order)
   * and resolves with the matching rowsByCall entry.
   */
  function makeDb(rowsByCall: unknown[][]) {
    const captured: Captured[] = [];
    const finish = (entry: Captured) => {
      const rows = rowsByCall[captured.indexOf(entry)] ?? [];
      return {
        limit: async () => rows,
        then: (resolve: (v: unknown[]) => void) => resolve(rows),
      };
    };
    const makeWhere = (entry: Captured) => ({
      where: (clause: unknown) => {
        const w = dialect.sqlToQuery(clause as never);
        entry.where = w.sql;
        entry.params = w.params as unknown[];
        return finish(entry);
      },
    });
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: (table: unknown, on: unknown) => {
            const entry: Captured = {
              join: { table, on: dialect.sqlToQuery(on as never).sql },
              where: '',
              params: [],
            };
            captured.push(entry);
            return makeWhere(entry);
          },
          where: (clause: unknown) => {
            const w = dialect.sqlToQuery(clause as never);
            const entry: Captured = { join: null, where: w.sql, params: w.params as unknown[] };
            captured.push(entry);
            return finish(entry);
          },
        }),
      }),
      execute: async () => [],
    };
    return { db, captured };
  }

  /** Tripwire: completed-games join + status filter present and correct. */
  function expectCompletedOnly(entry: Captured) {
    expect(entry.join).not.toBeNull();
    expect(entry.join!.table).toBe(matches);
    expect(entry.join!.on).toMatch(/"matches"\."id" = "match_players"\."match_id"/);
    expect(entry.where).toMatch(/"match_players"\."user_id" = /);
    expect(entry.where).toMatch(/"matches"\."status" = /);
    expect(entry.params.includes('Completed')).toBe(true);
  }

  it('getStats counts games ONLY from completed matches', async () => {
    const { db, captured } = makeDb([
      [{ karma_score: 10, no_show_count: 0 }], // query 1: the user row
      [{ count: 7 }], // query 2: the games_played COUNT
    ]);
    const service = makeService(db);
    const stats = await service.getStats('u1');
    expect(stats.games_played).toBe(7);
    expect(captured.length).toBe(2);
    expectCompletedOnly(captured[1]!);
  });

  it('getPublicProfile counts games ONLY from completed matches', async () => {
    const { db, captured } = makeDb([
      [{ id: 'u1', full_name: 'A', handle: 'a1', avatar_url: null, preferred_position: null }], // profile row
      [{ games_played: 3, no_show_count: 1 }], // games_played + no_show aggregates
      [], // follow lookup
    ]);
    const service = makeService(db);
    const profile = await service.getPublicProfile('u1', 'u2');
    expect(profile.games_played).toBe(3);
    expect(profile.no_show_count).toBe(1);
    expect(captured.length).toBe(3);
    expectCompletedOnly(captured[1]!);
  });
});
