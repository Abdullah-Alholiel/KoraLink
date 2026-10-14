import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { asc, desc } from 'drizzle-orm';
import { match_messages } from '../../database/schema';
import { MatchesService } from './matches.service';

/**
 * P1-3 (run #65): keyset pagination for match chat history.
 *
 * Contract pinned here:
 * - Default call stays bare-array, limit 50 (zero change for existing clients).
 * - `limit` is clamped to [1, 100] — no table-dumping via query params.
 * - `before` cursor → PK anchor read; unknown or cross-match cursors 404
 *   (no silent cross-match leak, no empty page on a forged id).
 * - Membership (P0-1) still precedes everything.
 *
 * Mocking technique follows matches.access-control.spec.ts: the membership
 * stub EVALUATES the and(eq(col,val)) conditions the service builds.
 */
describe('MatchesService.getMessages — P1-3 keyset pagination (run #65)', () => {
  const MATCH_ID = 'match-1';
  const MEMBER = 'member-1';
  const OUTSIDER = 'outsider-1';

  /** Walk a Drizzle SQL/and/eq tree, collecting (columnName, value) pairs. */
  function collectEqPairs(node: unknown, out: Array<[string, unknown]>): void {
    if (Array.isArray(node)) {
      node.forEach((n) => collectEqPairs(n, out));
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.queryChunks)) {
        collectEqPairs(obj.queryChunks, out);
        return;
      }
      if ('brand' in obj && 'value' in obj) {
        for (let i = out.length - 1; i >= 0; i--) {
          if (out[i][1] === undefined) {
            out[i][1] = obj.value;
            return;
          }
        }
        return;
      }
      if (typeof obj.name === 'string' && 'table' in obj) {
        out.push([obj.name, undefined]);
      }
    }
  }

  /**
   * Flatten a Drizzle orderBy callback result into a comparable signature
   * "col1,col2|dir". The service passes orderBy as a CALLBACK — Drizzle
   * invokes it with (table, { asc, desc }) — so resolve it here with the real
   * operators. asc(col) is a SQL object whose queryChunks are
   * [StringChunk(''), PgColumn(name), StringChunk(' asc')]: column names ride
   * .name on the column chunk, direction rides the trailing StringChunk.
   */
  function orderSignature(orderBy: unknown): string {
    const resolved =
      typeof orderBy === 'function'
        ? (orderBy as (t: never, ops: { asc: typeof asc; desc: typeof desc }) => unknown[])(
            match_messages as never,
            { asc, desc },
          )
        : orderBy;
    const rows = Array.isArray(resolved) ? resolved : [resolved];
    const cols: string[] = [];
    let dir = 'asc';
    for (const row of rows) {
      const chunks = (row as { queryChunks?: Array<Record<string, unknown>> })
        ?.queryChunks;
      if (!Array.isArray(chunks)) continue;
      for (const chunk of chunks) {
        const name = chunk?.name;
        if (name === 'created_at' || name === 'id') cols.push(name);
        const v = chunk?.value;
        if (Array.isArray(v) && v.some((s) => typeof s === 'string' && s.includes('desc'))) {
          dir = 'desc';
        }
      }
    }
    return `${cols.join(',')}|${dir}`;
  }

  function makeService(rows: {
    memberships: Array<{ match_id: string; user_id: string }>;
    messages: unknown[];
    cursorRow?: { id: string; match_id: string; created_at: Date } | null;
  }) {
    const findManyCalls: Array<Record<string, unknown>> = [];
    const db = {
      query: {
        match_messages: {
          findMany: async (args: Record<string, unknown>) => {
            findManyCalls.push(args);
            return rows.messages;
          },
          findFirst: async () => rows.cursorRow ?? null,
        },
      },
      select: () => ({
        from: () => ({
          where: (cond: unknown) => ({
            limit: async () => {
              const pairs: Array<[string, unknown]> = [];
              collectEqPairs(cond, pairs);
              const wanted = Object.fromEntries(pairs);
              const filtered = rows.memberships.filter(
                (m) =>
                  (wanted.match_id === undefined ||
                    m.match_id === wanted.match_id) &&
                  (wanted.user_id === undefined || m.user_id === wanted.user_id),
              );
              return filtered.length ? [filtered[0]] : [];
            },
          }),
        }),
      }),
    };
    const svc = new MatchesService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { promoteNextInTx: async () => null } as never,
    );
    return { svc, findManyCalls };
  }

  it('default call: latest-50 window (DESC probe, reversed to chronological), bare array', async () => {
    const rows = [{ id: '77777777-7777-4777-8777-777777777777' }, { id: '88888888-8888-4888-8888-888888888888' }];
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: rows,
    });
    const out = await svc.getMessages(MATCH_ID, MEMBER);
    // Window fix: response stays chronological, but the probed window is
    // the LATEST page (was: earliest-50 — new messages vanished on reload).
    expect(findManyCalls[0].limit).toBe(50);
    expect(findManyCalls[0].orderBy).toBeDefined();
    expect(out).toEqual(rows);
    expect(out).toHaveLength(2);
  });

  it('clamps limit into [1, 100]', async () => {
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
    });
    await svc.getMessages(MATCH_ID, MEMBER, { limit: 5000 });
    expect(findManyCalls[0].limit).toBe(100);
    // limit=0 is falsy → treated as "unset" → default page of 50
    await svc.getMessages(MATCH_ID, MEMBER, { limit: 0 });
    expect(findManyCalls[1].limit).toBe(50);
    await svc.getMessages(MATCH_ID, MEMBER, { limit: -10 });
    expect(findManyCalls[2].limit).toBe(1);
  });

  it('before cursor: anchors on the message row and pages strictly older', async () => {
    const anchorTime = new Date('2026-09-01T10:00:00Z');
    const olderPage = [{ id: '22222222-2222-4222-8222-222222222222' }];
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: olderPage,
      cursorRow: { id: '11111111-1111-4111-8111-111111111111', match_id: MATCH_ID, created_at: anchorTime },
    });
    const out = await svc.getMessages(MATCH_ID, MEMBER, {
      before: '11111111-1111-4111-8111-111111111111',
      limit: 20,
    });
    expect(out).toEqual(olderPage);
    expect(findManyCalls[0].limit).toBe(20);
    // The composite keyset predicate must mention the cursor id bound value.
    const pairs: Array<[string, unknown]> = [];
    collectEqPairs(findManyCalls[0].where, pairs);
    expect(pairs.some(([, v]) => v === '11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('unknown cursor id → NotFoundException (no silent empty page)', async () => {
    const { svc } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
      cursorRow: null,
    });
    await expect(
      svc.getMessages(MATCH_ID, MEMBER, { before: 'forged-id' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cursor from ANOTHER match → NotFoundException (no cross-match leak)', async () => {
    const { svc } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
      cursorRow: {
        id: '33333333-3333-4333-8333-333333333333',
        match_id: '44444444-4444-4444-8444-444444444444',
        created_at: new Date(),
      },
    });
    await expect(
      svc.getMessages(MATCH_ID, MEMBER, { before: '33333333-3333-4333-8333-333333333333' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('run #66: both windows order by (created_at, id) — timestamp ties page deterministically', async () => {
    // The keyset predicate is composite (created_at, id) <; the ORDER BY must
    // mirror it or duplicate created_at values straddling a page boundary
    // make tie-order nondeterministic (a message can skip/dup across pages).
    const anchorTime = new Date('2026-09-01T10:00:00Z');
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
      cursorRow: { id: '11111111-1111-4111-8111-111111111111', match_id: MATCH_ID, created_at: anchorTime },
    });

    await svc.getMessages(MATCH_ID, MEMBER, { before: '11111111-1111-4111-8111-111111111111' });
    await svc.getMessages(MATCH_ID, MEMBER);

    expect(orderSignature(findManyCalls[0].orderBy)).toMatch(/^created_at,id\|asc$/);
    expect(orderSignature(findManyCalls[1].orderBy)).toMatch(/^created_at,id\|desc$/);
  });

  it('membership check still precedes cursor handling (P0-1)', async () => {
    const { svc, findManyCalls } = makeService({
      memberships: [],
      messages: [],
      cursorRow: { id: '66666666-6666-4666-8666-666666666666', match_id: MATCH_ID, created_at: new Date() },
    });
    await expect(
      svc.getMessages(MATCH_ID, OUTSIDER, { before: '66666666-6666-4666-8666-666666666666' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findManyCalls).toHaveLength(0);
  });

  // ── P2-196 (run #132): the `after` direction — reconnect backfill ──────

  it('after cursor: anchors on the message row and pages strictly newer (ASC)', async () => {
    const anchorTime = new Date('2026-09-01T10:00:00Z');
    const newerPage = [{ id: '22222222-2222-4222-8222-222222222222' }];
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: newerPage,
      cursorRow: { id: '11111111-1111-4111-8111-111111111111', match_id: MATCH_ID, created_at: anchorTime },
    });
    const out = await svc.getMessages(MATCH_ID, MEMBER, {
      after: '11111111-1111-4111-8111-111111111111',
      limit: 20,
    });
    expect(out).toEqual(newerPage);
    expect(findManyCalls[0].limit).toBe(20);
    // The composite keyset predicate must mention the cursor id bound value.
    const pairs: Array<[string, unknown]> = [];
    collectEqPairs(findManyCalls[0].where, pairs);
    expect(pairs.some(([, v]) => v === '11111111-1111-4111-8111-111111111111')).toBe(true);
    // Backfill pages forward — ASC order, mirroring the before direction.
    expect(orderSignature(findManyCalls[0].orderBy)).toMatch(/^created_at,id\|asc$/);
  });

  it('after cursor: unknown id → NotFoundException (no silent empty page)', async () => {
    const { svc } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
      cursorRow: null,
    });
    await expect(
      svc.getMessages(MATCH_ID, MEMBER, { after: 'forged-id' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('PR-Agent r2: non-UUID-shaped cursor (before or after) → NotFoundException without a DB read', async () => {
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
      cursorRow: null,
    });
    // 'forged-id' is not UUID-shaped — rejected on shape alone (same contract
    // the WS gateway applies to room ids; no uuid-cast 500 possible).
    await expect(
      svc.getMessages(MATCH_ID, MEMBER, { after: 'forged-id' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.getMessages(MATCH_ID, MEMBER, { before: ' ../../etc/passwd' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findManyCalls).toHaveLength(0);
  });

  it('after cursor from ANOTHER match → NotFoundException (no cross-match leak)', async () => {
    const { svc } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
      cursorRow: {
        id: '33333333-3333-4333-8333-333333333333',
        match_id: '44444444-4444-4444-8444-444444444444',
        created_at: new Date(),
      },
    });
    await expect(
      svc.getMessages(MATCH_ID, MEMBER, { after: '33333333-3333-4333-8333-333333333333' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('both cursors at once → BadRequestException (client bug, clean 400)', async () => {
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
      cursorRow: { id: '55555555-5555-4555-8555-555555555555', match_id: MATCH_ID, created_at: new Date() },
    });
    await expect(
      svc.getMessages(MATCH_ID, MEMBER, {
        before: '55555555-5555-4555-8555-555555555555',
        after: '55555555-5555-4555-8555-555555555555',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // The 400 fires before any cursor anchor read.
    expect(findManyCalls).toHaveLength(0);
  });

  it('after with a large limit still clamps into [1, 100]', async () => {
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: [],
      cursorRow: { id: '55555555-5555-4555-8555-555555555555', match_id: MATCH_ID, created_at: new Date() },
    });
    await svc.getMessages(MATCH_ID, MEMBER, { after: '55555555-5555-4555-8555-555555555555', limit: 5000 });
    expect(findManyCalls[0].limit).toBe(100);
  });
});
