import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players } from '../../database/schema';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * P2-49 final sub-class (run #37): FOR UPDATE row locks on the matches row in
 * joinMatch / leaveMatch / removePlayer — kills the count-then-insert overbook
 * race (two concurrent joins both reading count < max) and interleaved status
 * flips. The tx stub routes rows by table identity; `selects` records every
 * select call so the specs can assert the lock is the FIRST statement / present.
 *
 * Lock-order rule under test: matches row locked FIRST everywhere (same as
 * cancelMatch); join/leave/remove never touch pitch_slots, so no cycle with
 * rescheduleMatch's ordered slot locks.
 */
describe('MatchesService row locks (P2-49 run #37)', () => {
  const USER = 'user-1';
  const HOST = 'host-1';
  const MATCH_ID = 'match-1';

  function thenable(): { then: (r: (v: unknown) => void) => void } {
    return { then: (r: (v: unknown) => void) => r([]) };
  }

  type SelectRecord = { table: unknown; lock?: string; thenRows: unknown[] };

  function makeTx(opts: {
    match?: unknown | null;
    player?: unknown | null;
    playerRows?: unknown[];
    homeCount?: number;
    awayCount?: number;
    count?: number;
  }) {
    const selects: SelectRecord[] = [];
    let mpCalls = 0;
    function chainFor(rows: unknown[], table?: unknown) {
      const rec: SelectRecord = { table, thenRows: rows };
      const chain: any = {
        where: () => chain,
        limit: () => chain,
        for: (strength: string) => {
          rec.lock = strength;
          return chain;
        },
      };
      chain.then = (resolve: (v: unknown) => void) => resolve(rows);
      selects.push(rec);
      return chain;
    }
    const tx = {
      select: () => ({
        from: (table: unknown) => {
          if (table === matches) {
            return chainFor(opts.match === undefined ? [] : opts.match ? [opts.match] : [], table);
          }
          if (table === match_players) {
            // Call order in joinMatch: membership select FIRST, then the
            // count/homeCount/awayCount aggregates. Leave/remove also do
            // membership first. So: first match_players select → membership
            // (opts.player); subsequent ones pop aggregate rows in order.
            mpCalls += 1;
            if (mpCalls === 1) {
              return chainFor(opts.player ? [opts.player] : [], table);
            }
            const popped = opts.playerRows?.shift();
            return chainFor(popped ? [popped] : [], table);
          }
          return chainFor([], table);
        },
      }),
      update: () => ({ set: () => ({ where: () => thenable() }) }),
      delete: () => ({ where: () => thenable() }),
      insert: () => ({ values: () => thenable() }),
      execute: (q: unknown) => {
        selects.push({ table: '__raw__', thenRows: [], lock: 'update', raw: q } as SelectRecord & { raw?: unknown });
        return thenable();
      },
    };
    return { tx, selects };
  }

  function makeService(tx: unknown) {
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
            players: [
              { id: HOST, is_host: true, user: { id: HOST, full_name: 'H' }, no_show: false },
              { id: USER, is_host: false, user: { id: USER, full_name: 'P' }, no_show: false },
            ],
            messages: [],
          }),
        },
      },
      select: () => ({ from: () => ({ where: () => ({ then: (r: (v: unknown) => void) => r([{ user_id: USER }]) }) }) }),
    };
    const svc = new MatchesService(
      db as never,
      {} as never, // walletService
      { broadcastRosterUpdate: () => {}, broadcastStatusUpdate: () => {} } as never,
      { sendPushToUsers: async () => {} } as never,
      { record: async () => {} } as never,
      { getNumber: async () => 0 } as never,
      { broadcastOps: () => {} } as never,
    );
    return svc;
  }

  // ── joinMatch ─────────────────────────────────────────────────────────────

  it('joinMatch locks the matches row FOR UPDATE as its FIRST statement', async () => {
    const { tx, selects } = makeTx({
      match: { id: MATCH_ID, status: 'Open', max_players: 10 },
      playerRows: [{ count: 2 }, { homeCount: 1 }, { awayCount: 1 }],
      player: undefined,
    });
    const svc = makeService(tx);
    await svc.joinMatch(USER, MATCH_ID);
    const first = selects[0];
    expect(first).toBeDefined();
    expect(first.lock).toBe('update');
    expect(first.table === matches || first.table === '__raw__').toBe(true);
  });

  it('joinMatch still throws NotFound for an unknown match (lock applied first)', async () => {
    const { tx } = makeTx({ match: null, playerRows: [{ count: 0 }, { homeCount: 0 }, { awayCount: 0 }] });
    const svc = makeService(tx);
    await expect(svc.joinMatch(USER, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('joinMatch rejects when the roster is already at max (count >= max_players)', async () => {
    const { tx } = makeTx({
      match: { id: MATCH_ID, status: 'Open', max_players: 2 },
      playerRows: [{ count: 2 }, { homeCount: 1 }, { awayCount: 1 }],
    });
    const svc = makeService(tx);
    await expect(svc.joinMatch(USER, MATCH_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── leaveMatch ────────────────────────────────────────────────────────────

  it('leaveMatch locks the matches row FOR UPDATE as its FIRST statement (raw ::text lock)', async () => {
    const { tx, selects } = makeTx({
      match: { id: MATCH_ID, status: 'Open', host_id: HOST, min_players: 4, total_players: 6 },
      player: { id: 'mp-1', is_host: false },
    });
    const svc = makeService(tx);
    await svc.leaveMatch(USER, MATCH_ID);
    const first = selects[0];
    expect(first).toBeDefined();
    expect(first.table).toBe('__raw__');
    expect(first.lock).toBe('update');
    // Raw lock statement must cast the id param to ::text (varchar(36) rule).
    const q = new PgDialect().sqlToQuery((first as unknown as { raw: ReturnType<typeof sql> }).raw as never);
    expect(q.sql).toContain('FOR UPDATE');
    expect(q.sql).toContain('::text');
    expect(q.sql).not.toContain('::uuid');
  });

  it('leaveMatch still rejects non-members (lock applied first, membership error preserved)', async () => {
    const { tx } = makeTx({ match: { id: MATCH_ID, status: 'Open', host_id: HOST, min_players: 0, total_players: 1 }, player: null });
    const svc = makeService(tx);
    await expect(svc.leaveMatch(USER, MATCH_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── removePlayer ───────────────────────────────────────── matches.service ──

  it('removePlayer locks the matches row FOR UPDATE as its FIRST statement', async () => {
    const { tx, selects } = makeTx({
      match: { id: MATCH_ID, host_id: HOST, status: 'Open' },
      player: { id: 'mp-1' },
    });
    const svc = makeService(tx);
    await svc.removePlayer(HOST, MATCH_ID, USER);
    const first = selects[0];
    expect(first).toBeDefined();
    expect(first.lock).toBe('update');
    expect(first.table === matches || first.table === '__raw__').toBe(true);
  });

  it('removePlayer keeps guard semantics (self-removal pre-tx guard → BadRequest)', async () => {
    const { tx } = makeTx({
      match: { id: MATCH_ID, host_id: HOST, status: 'Open' },
      player: { id: 'mp-1' },
    });
    const svc = makeService(tx);
    await expect(svc.removePlayer(HOST, MATCH_ID, HOST)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removePlayer still rejects a non-host caller with Forbidden', async () => {
    const { tx } = makeTx({
      match: { id: MATCH_ID, host_id: HOST, status: 'Open' },
      player: null,
    });
    const svc = makeService(tx);
    await expect(svc.removePlayer('intruder', MATCH_ID, USER)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
