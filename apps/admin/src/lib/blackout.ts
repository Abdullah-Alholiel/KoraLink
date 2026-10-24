import { ApiError } from '@/lib/api';

/** Server cap (P2-246 BlackoutSlotsDto): an inclusive range spans ≤ 62 days. */
export const BLACKOUT_MAX_DAYS = 62;

export interface BlackoutResult {
  closedInstances: number;
  skippedBooked: number;
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

export type BlackoutErrorKind = 'range' | 'access' | 'network';

/** Maps a failed call to a localized-copy bucket — never the raw backend text. */
export function blackoutErrorKind(e: unknown): BlackoutErrorKind {
  if (e instanceof ApiError) {
    if (e.status === 400) return 'range';
    if (e.status === 401 || e.status === 403 || e.status === 404) return 'access';
  }
  return 'network';
}
