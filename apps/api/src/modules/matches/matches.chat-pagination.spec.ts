import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
    const rows = [{ id: 'm1' }, { id: 'm2' }];
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
    const olderPage = [{ id: 'm-old' }];
    const { svc, findManyCalls } = makeService({
      memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
      messages: olderPage,
      cursorRow: { id: 'm-cursor', match_id: MATCH_ID, created_at: anchorTime },
    });
    const out = await svc.getMessages(MATCH_ID, MEMBER, {
      before: 'm-cursor',
      limit: 20,
    });
    expect(out).toEqual(olderPage);
    expect(findManyCalls[0].limit).toBe(20);
    // The composite keyset predicate must mention the cursor id bound value.
    const pairs: Array<[string, unknown]> = [];
    collectEqPairs(findManyCalls[0].where, pairs);
    expect(pairs.some(([, v]) => v === 'm-cursor')).toBe(true);
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
        id: 'm-other',
        match_id: 'match-OTHER',
        created_at: new Date(),
      },
    });
    await expect(
      svc.getMessages(MATCH_ID, MEMBER, { before: 'm-other' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('membership check still precedes cursor handling (P0-1)', async () => {
    const { svc, findManyCalls } = makeService({
      memberships: [],
      messages: [],
      cursorRow: { id: 'm-x', match_id: MATCH_ID, created_at: new Date() },
    });
    await expect(
      svc.getMessages(MATCH_ID, OUTSIDER, { before: 'm-x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findManyCalls).toHaveLength(0);
  });
});
