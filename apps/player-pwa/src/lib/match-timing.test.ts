/**
 * matchHasStarted status-truth regression (2026-09-18 "Ladies Night" bug).
 *
 * The clock clause (`scheduledAt <= now`) made every non-started match read
 * as "started" once kick-off passed — routing the Join CTA into the Ongoing
 * Game sheet ("Join Ongoing Match") for matches that never began. A match
 * is started IFF the DB says InProgress (host pressed Start); the wall clock
 * must not fabricate lifecycle state.
 */
import { describe, expect, it } from 'vitest';
import { matchHasStarted, matchHasEnded } from './match-timing';

describe('matchHasStarted — status-only truth', () => {
  it('is false when the host never pressed Start — even past kick-off (the bug)', () => {
    // Timestamps are intentionally absent: kick-off time is no longer part
    // of the contract at all (PR-Agent finding, PR #31).
    expect(matchHasStarted({ status: 'open' })).toBe(false);
    expect(matchHasStarted({ status: 'full' })).toBe(false);
  });

  it('is true exactly when the DB status is in_progress', () => {
    expect(matchHasStarted({ status: 'in_progress' })).toBe(true);
  });
});

describe('matchHasEnded — end-of-window clock clause stays (display gating)', () => {
  it('reads a past-end match as ended regardless of status', () => {
    expect(
      matchHasEnded({
        status: 'open',
        endsAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  it('reads terminal statuses as ended immediately', () => {
    expect(matchHasEnded({ status: 'completed' })).toBe(true);
    expect(matchHasEnded({ status: 'cancelled' })).toBe(true);
  });
});
