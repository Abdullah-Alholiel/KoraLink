import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';

/**
 * P0-1 access-control specs: REST chat reads must enforce the same
 * membership rule the WS gateway already enforces (join-lobby /
 * send-message). Instantiated with a stubbed Drizzle DB.
 */
describe('MatchesService chat access control (P0-1)', () => {
  const HOST = 'host-1';
  const MEMBER = 'member-1';
  const OUTSIDER = 'outsider-1';
  const MATCH_ID = 'match-1';

  function makeService(rows: {
    match?: unknown;
    memberships: Array<{ match_id: string; user_id: string }>;
    messages: unknown[];
  }) {
    const db = {
      query: {
        matches: {
          findFirst: async ({ where }: { where?: unknown }) => {
            // Only match the expected eq(matches.id, matchId) shape.
            void where;
            return rows.match ?? null;
          },
        },
        match_messages: {
          findMany: async () => rows.messages,
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              rows.memberships.length
                ? [rows.memberships[0]]
                : [],
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
