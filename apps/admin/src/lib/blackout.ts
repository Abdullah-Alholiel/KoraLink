import { ApiError } from '@/lib/api';

/** Server cap (P2-246 BlackoutSlotsDto): an inclusive range spans ≤ 62 days. */
export const BLACKOUT_MAX_DAYS = 62;

export interface BlackoutResult {
  closedInstances: number;
  skippedBooked: number;
  /**
   * P2-255 (run #194): booked matches blocking the range — the panel deep-links
   * each to its partner match page. Optional so an older API response (count
   * only) still type-checks; render guards on presence + length.
   */
  bookedMatches?: BlackoutBookedMatch[];
}

/** One booked match inside the blackout range (wire shape, blackoutSlots response). */
export interface BlackoutBookedMatch {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  spotsFilled: number;
  maxPlayers: number;
}

export type BlackoutRangeIssue = 'missing' | 'order' | 'tooLong' | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Inclusive day count of a YYYY-MM-DD range (calendar fields, TZ-free). */
export function blackoutSpanDays(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000) + 1;
}

/** Client-side mirror of the server range rules, checked before submit. */
export function validateBlackoutRange(from: string, to: string): BlackoutRangeIssue {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return 'missing';
  if (to < from) return 'order';
  if (blackoutSpanDays(from, to) > BLACKOUT_MAX_DAYS) return 'tooLong';
  return null;
}

export type BlackoutErrorKind = 'range' | 'auth' | 'access' | 'server' | 'network';

/** Maps a failed call to a localized-copy bucket — never the raw backend text. */
export function blackoutErrorKind(e: unknown): BlackoutErrorKind {
  if (e instanceof ApiError) {
    if (e.status === 400) return 'range';
    if (e.status === 401) return 'auth';
    if (e.status === 403 || e.status === 404) return 'access';
    if (e.status === 429 || e.status >= 500) return 'server';
  }
  return 'network';
}

/**
 * P2-323 (run #194): shared ApiError→copy bucket for pitch actions
 * (toggle/save/delete) — the settlements moneyActionFailure shape minus the
 * 409 leg (pitch writes have no conflict path today). Callers map each bucket
 * to its own localized key; raw backend text is never rendered.
 */
export type PitchActionFailure = 'auth' | 'access' | 'validation' | 'server' | 'network';

export function pitchActionFailure(err: unknown): PitchActionFailure {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'auth';
    if (err.status === 403 || err.status === 404) return 'access';
    if (err.status === 429 || err.status >= 500) return 'server';
    // PR-Agent r3 (run #194, PR #228): ANY other 4xx (409/422/…) is a
    // server-REJECTED request — it must never read as a connection problem.
    if (err.status >= 400) return 'validation';
  }
  return 'network';
}
