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

const TEN_MIN_AGO = new Date(Date.now() - 10 * 60_000).toISOString();
const IN_TEN_MIN = new Date(Date.now() + 10 * 60_000).toISOString();

describe('matchHasStarted — status-only truth', () => {
  it('is false for an Open match whose kick-off has passed (the bug)', () => {
    expect(matchHasStarted({ status: 'open', scheduledAt: TEN_MIN_AGO })).toBe(false);
  });

  it('is false for a Full match whose kick-off has passed (host never pressed Start)', () => {
    expect(matchHasStarted({ status: 'full', scheduledAt: TEN_MIN_AGO })).toBe(false);
  });

  it('is true exactly when the DB status is in_progress', () => {
    expect(matchHasStarted({ status: 'in_progress', scheduledAt: IN_TEN_MIN })).toBe(true);
    expect(matchHasStarted({ status: 'in_progress', scheduledAt: TEN_MIN_AGO })).toBe(true);
  });

  it('is false for future, non-started matches', () => {
    expect(matchHasStarted({ status: 'open', scheduledAt: IN_TEN_MIN })).toBe(false);
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
