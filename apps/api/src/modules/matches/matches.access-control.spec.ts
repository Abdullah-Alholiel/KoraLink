import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';

/**
 * P0-1 access-control specs: REST chat reads must enforce the same
 * membership rule the WS gateway already enforces (join-lobby /
 * send-message). Instantiated with a stubbed Drizzle DB.
 *
 * The membership stub EVALUATES the `and(eq(col, val), …)` conditions the
 * service builds (walking Drizzle's SQL queryChunks for column names and
 * bound values), so a wrong-column comparison in the service fails here
 * instead of silently passing.
 */
describe('MatchesService chat access control (P0-1)', () => {
  const HOST = 'host-1';
  const MEMBER = 'member-1';
  const OUTSIDER = 'outsider-1';
  const OTHER_MATCH = 'match-2';
  const MATCH_ID = 'match-1';

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
      // Param nodes expose { brand, value, encoder } — bound values.
      if ('brand' in obj && 'value' in obj) {
        for (let i = out.length - 1; i >= 0; i--) {
          if (out[i][1] === undefined) {
            out[i][1] = obj.value;
            return;
          }
        }
        return;
      }
      // Column nodes expose { name, table, … }; StringChunk (bare { value })
      // is skipped — only columns open a new placeholder.
      if (typeof obj.name === 'string' && 'table' in obj) {
        out.push([obj.name, undefined]);
      }
    }
  }

  function makeService(rows: {
    match?: unknown;
    memberships: Array<{ match_id: string; user_id: string }>;
    messages: unknown[];
  }) {
    // Clone the match fixture: the service REASSIGNS match.messages when
    // stripping, which would otherwise mutate the shared baseMatch object
    // across tests.
    const matchRow = rows.match
      ? {
          ...(rows.match as Record<string, unknown>),
          messages: [
            ...((rows.match as Record<string, unknown>).messages as unknown[]),
          ],
        }
      : undefined;
    const db = {
      query: {
        matches: {
          findFirst: async () => matchRow ?? null,
        },
        match_messages: {
          findMany: async () => rows.messages,
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
    return new MatchesService(
      db as never, // DB_CONNECTION
      {} as never, // walletService
      {} as never, // appGateway
      {} as never, // notificationsService
      {} as never, // activitiesService
      {} as never, // settings (PlatformSettingsService)
      {} as never, // realtime
    );
  }

  const baseMatch = {
    id: MATCH_ID,
    status: 'Open',
    scheduled_at: new Date('2026-09-01T18:00:00Z'),
    duration_mins: 90,
    completed_at: null,
    host: { id: HOST },
    messages: [{ id: 'msg-1', content: 'see you on the pitch' }],
  };

  describe('findOne(viewerId) — embedded chat stripping', () => {
    it('keeps messages for a member viewer', async () => {
      const svc = makeService({
        match: baseMatch,
        memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
        messages: [],
      });
      const detail = await svc.findOne(MATCH_ID, MEMBER);
      expect(detail.messages).toHaveLength(1);
    });

    it('keeps messages for the HOST viewer (host is a match_player row)', async () => {
      const svc = makeService({
        match: baseMatch,
        memberships: [{ match_id: MATCH_ID, user_id: HOST }],
        messages: [],
      });
      const detail = await svc.findOne(MATCH_ID, HOST);
      expect(detail.messages).toHaveLength(1);
    });

    it('strips messages when the viewer is only a member of ANOTHER match (column-correct filter)', async () => {
      const svc = makeService({
        match: baseMatch,
        memberships: [{ match_id: OTHER_MATCH, user_id: OUTSIDER }],
        messages: [],
      });
      const detail = await svc.findOne(MATCH_ID, OUTSIDER);
      expect(detail.messages).toEqual([]);
    });

    it('keeps messages when no viewer is passed (internal callers)', async () => {
      const svc = makeService({
        match: baseMatch,
        memberships: [],
        messages: [],
      });
      const detail = await svc.findOne(MATCH_ID);
      expect(detail.messages).toHaveLength(1);
    });

    it('strips messages for a non-member viewer (public match)', async () => {
      const svc = makeService({
        match: { ...baseMatch, visibility: 'public' },
        memberships: [],
        messages: [],
      });
      const detail = await svc.findOne(MATCH_ID, OUTSIDER);
      expect(detail.messages).toEqual([]);
      // Metadata still readable for invite-link holders.
      expect(detail.id).toBe(MATCH_ID);
    });

    it('strips messages for a non-member viewer (private match)', async () => {
      const svc = makeService({
        match: { ...baseMatch, visibility: 'private' },
        memberships: [],
        messages: [],
      });
      const detail = await svc.findOne(MATCH_ID, OUTSIDER);
      expect(detail.messages).toEqual([]);
    });

    it('still throws NotFound for a missing match', async () => {
      const svc = makeService({ memberships: [], messages: [] });
      await expect(svc.findOne('missing', OUTSIDER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getMessages(viewerId) — members-only history', () => {
    it('returns history for a member', async () => {
      const svc = makeService({
        match: baseMatch,
        memberships: [{ match_id: MATCH_ID, user_id: MEMBER }],
        messages: [{ id: 'msg-1' }],
      });
      const msgs = await svc.getMessages(MATCH_ID, MEMBER);
      expect(msgs).toHaveLength(1);
    });

    it('throws Forbidden when the viewer only belongs to a DIFFERENT match', async () => {
      const svc = makeService({
        match: baseMatch,
        memberships: [{ match_id: OTHER_MATCH, user_id: OUTSIDER }],
        messages: [{ id: 'msg-1' }],
      });
      await expect(svc.getMessages(MATCH_ID, OUTSIDER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws Forbidden for a non-member viewer', async () => {
      const svc = makeService({
        match: baseMatch,
        memberships: [],
        messages: [{ id: 'msg-1' }],
      });
      await expect(
        svc.getMessages(MATCH_ID, OUTSIDER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns history when no viewer is passed (internal)', async () => {
      const svc = makeService({
        match: baseMatch,
        memberships: [],
        messages: [{ id: 'msg-1' }],
      });
      const msgs = await svc.getMessages(MATCH_ID);
      expect(msgs).toHaveLength(1);
    });
  });
});
