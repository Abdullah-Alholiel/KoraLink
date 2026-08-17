import { describe, it, expect } from 'vitest';
import {
  MATCH_START_EARLY_WINDOW_MINUTES,
  MATCH_END_EARLY_WINDOW_MINUTES,
  startEarliestAt,
  endEarliestAt,
  canStartMatch,
  canEndMatch,
  matchHasStarted,
  matchHasEnded,
} from '@/lib/match-timing';

const scheduledAt = '2026-08-17T17:00:00.000Z';
const endsAt = '2026-08-17T18:30:00.000Z';

const match = { scheduledAt, endsAt };

describe('match-timing', () => {
  it('startEarliestAt is kick-off minus 30 minutes', () => {
    const at = startEarliestAt(match)!;
    expect(at.getTime()).toBe(
      new Date(scheduledAt).getTime() - MATCH_START_EARLY_WINDOW_MINUTES * 60_000,
    );
  });

  it('endEarliestAt is scheduled end minus 30 minutes', () => {
    const at = endEarliestAt(match)!;
    expect(at.getTime()).toBe(
      new Date(endsAt).getTime() - MATCH_END_EARLY_WINDOW_MINUTES * 60_000,
    );
  });

  it('canStartMatch is false before the window and true after', () => {
    const before = new Date(scheduledAt).getTime() - 31 * 60_000;
    const after = new Date(scheduledAt).getTime() - 29 * 60_000;
    expect(canStartMatch(match, before)).toBe(false);
    expect(canStartMatch(match, after)).toBe(true);
  });

  it('canEndMatch is false before end−30 and true after', () => {
    const before = new Date(endsAt).getTime() - 31 * 60_000;
    const after = new Date(endsAt).getTime() - 29 * 60_000;
    expect(canEndMatch(match, before)).toBe(false);
    expect(canEndMatch(match, after)).toBe(true);
  });

  it('returns false/null when timestamps are missing', () => {
    const empty = { scheduledAt: undefined, endsAt: undefined } as never;
    expect(startEarliestAt(empty)).toBeNull();
    expect(endEarliestAt(empty)).toBeNull();
    expect(canStartMatch(empty)).toBe(false);
    expect(canEndMatch(empty)).toBe(false);
  });

  it('matchHasStarted flips at kick-off', () => {
    expect(
      matchHasStarted(
        { status: 'open', scheduledAt },
        new Date(scheduledAt).getTime() - 1,
      ),
    ).toBe(false);
    expect(
      matchHasStarted(
        { status: 'open', scheduledAt },
        new Date(scheduledAt).getTime() + 1,
      ),
    ).toBe(true);
    expect(
      matchHasStarted(
        { status: 'in_progress', scheduledAt },
        new Date(scheduledAt).getTime() - 1,
      ),
    ).toBe(true);
  });

  it('matchHasEnded flips at scheduled end', () => {
    expect(
      matchHasEnded({ status: 'open', endsAt }, new Date(endsAt).getTime() - 1),
    ).toBe(false);
    expect(
      matchHasEnded({ status: 'open', endsAt }, new Date(endsAt).getTime() + 1),
    ).toBe(true);
    expect(
      matchHasEnded(
        { status: 'completed', endsAt },
        new Date(endsAt).getTime() - 1,
      ),
    ).toBe(true);
    expect(
      matchHasEnded(
        { status: 'cancelled', endsAt },
        new Date(endsAt).getTime() - 1,
      ),
    ).toBe(true);
  });
});
