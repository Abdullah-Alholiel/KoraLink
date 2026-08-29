import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';

/**
 * P2-22 (run #13): GET /matches/:id/calendar served private-match metadata
 * (title, time, venue name + ADDRESS) with NO viewer check — findOne(id) was
 * called without a viewer, so any authenticated user holding a private
 * match's ID could export its details as an ICS file or a Google Calendar
 * redirect. A calendar export leaves the user's control (downloaded file /
 * third-party redirect), so it is an export, not an invite-link page view:
 * private matches are now MEMBERS-ONLY on this route (host passes directly,
 * roster via the membership probe, everyone else 403).
 */
describe('MatchesService.getCalendarMatch access control (P2-22)', () => {
  const HOST = 'host-1';
  const MEMBER = 'member-1';
  const OUTSIDER = 'outsider-1';

  const PRIVATE_MATCH = {
    id: 'match-1',
    title: 'Private Tuesday game',
    match_type: 'Casual',
    gender_rule: 'Men Only',
    scheduled_at: new Date('2026-09-01T18:00:00Z'),
    duration_mins: 90,
    visibility: 'private',
    host_id: HOST,
    pitch: { venue: { name: 'Hidden Venue', address: 'Secret St 1' } },
  };

  function makeService(opts: {
    match?: unknown | null;
    isMember?: boolean;
  }) {
    const membershipQueried = { value: false };
    const db = {
      query: {
        matches: {
          findFirst: async () => (opts.match === undefined ? PRIVATE_MATCH : opts.match),
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              membershipQueried.value = true;
              return opts.isMember ? [{ id: 'mp-1' }] : [];
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
    );
    return { svc, membershipQueried };
  }

  it('serves a PUBLIC match to any authenticated viewer without a membership probe', async () => {
    const { svc, membershipQueried } = makeService({
      match: { ...PRIVATE_MATCH, visibility: 'public' },
    });

    const match = await svc.getCalendarMatch('match-1', OUTSIDER);

    expect(match.id).toBe('match-1');
    expect(membershipQueried.value).toBe(false);
  });

  it('serves a PRIVATE match to its host without a membership probe', async () => {
    const { svc, membershipQueried } = makeService({});

    const match = await svc.getCalendarMatch('match-1', HOST);

    expect(match.id).toBe('match-1');
    expect(membershipQueried.value).toBe(false);
  });

  it('serves a PRIVATE match to a roster member (probe fired)', async () => {
    const { svc, membershipQueried } = makeService({ isMember: true });

    const match = await svc.getCalendarMatch('match-1', MEMBER);

    expect(match.id).toBe('match-1');
    expect(membershipQueried.value).toBe(true);
  });

  it('403s a non-member on a PRIVATE match — no metadata, no ICS, no Google redirect', async () => {
    const { svc } = makeService({ isMember: false });

    await expect(
      svc.getCalendarMatch('match-1', OUTSIDER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s a missing match before any access decision', async () => {
    const { svc } = makeService({ match: null });

    await expect(
      svc.getCalendarMatch('missing', HOST),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
