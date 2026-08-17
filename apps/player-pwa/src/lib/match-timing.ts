import type { Match } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Match lifecycle timing — single source of truth for the host's start/end
// windows. Mirrors the API (MatchesService.START_EARLY_WINDOW_MINUTES /
// END_EARLY_WINDOW_MINUTES in apps/api/src/modules/matches/matches.service.ts).
// Keep the two constants in sync across both codebases.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors MatchesService.START_EARLY_WINDOW_MINUTES on the API. */
export const MATCH_START_EARLY_WINDOW_MINUTES = 30;

/** Mirrors MatchesService.END_EARLY_WINDOW_MINUTES on the API. */
export const MATCH_END_EARLY_WINDOW_MINUTES = 30;

type StartTiming = Pick<Match, 'scheduledAt'>;
type EndTiming = Pick<Match, 'endsAt'>;

/** Earliest instant the host may start the match (kick-off − 30 min). */
export function startEarliestAt(match: StartTiming): Date | null {
  if (!match.scheduledAt) return null;
  return new Date(
    new Date(match.scheduledAt).getTime() -
      MATCH_START_EARLY_WINDOW_MINUTES * 60_000,
  );
}

/** Earliest instant the host may end the match (scheduled end − 30 min). */
export function endEarliestAt(match: EndTiming): Date | null {
  if (!match.endsAt) return null;
  return new Date(
    new Date(match.endsAt).getTime() - MATCH_END_EARLY_WINDOW_MINUTES * 60_000,
  );
}

/** True when the host is allowed to press "Start Match". */
export function canStartMatch(
  match: StartTiming,
  now: number = Date.now(),
): boolean {
  const at = startEarliestAt(match);
  return at !== null && now >= at.getTime();
}

/** True when the host is allowed to press "End Match". */
export function canEndMatch(
  match: EndTiming,
  now: number = Date.now(),
): boolean {
  const at = endEarliestAt(match);
  return at !== null && now >= at.getTime();
}

/** True once the match is live (status in_progress or kick-off has passed). */
export function matchHasStarted(
  match: Pick<Match, 'status' | 'scheduledAt'>,
  now: number = Date.now(),
): boolean {
  return (
    match.status === 'in_progress' ||
    (!!match.scheduledAt && new Date(match.scheduledAt).getTime() <= now)
  );
}

/** True once the match is finished (completed/cancelled or scheduled end passed). */
export function matchHasEnded(
  match: Pick<Match, 'status' | 'endsAt'>,
  now: number = Date.now(),
): boolean {
  return (
    match.status === 'completed' ||
    match.status === 'cancelled' ||
    (!!match.endsAt && new Date(match.endsAt).getTime() <= now)
  );
}
