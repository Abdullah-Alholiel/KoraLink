/**
 * Riyadh calendar-date helpers (fixed UTC+03:00 — no DST).
 *
 * Extracted from modules/partner/partner.service.ts (run #163, P2-216 hex lane):
 * the ADMIN settlements module needs the same date axis as the PARTNER payout
 * path, and an admin→partner import would cross the module boundary. Common
 * utils carry no module semantics, so the helpers live here and both services
 * import from one source of truth. partner.service re-exports for spec compat.
 */

/** Asia/Riyadh is a fixed UTC+03:00 offset (no DST). */
export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** P2-109: Riyadh calendar date (YYYY-MM-DD) for an instant — never server-local. */
export function riyadhDateString(nowMs: number = Date.now()): string {
  return new Date(nowMs + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** P2-109: shift a YYYY-MM-DD date string by whole days (pure UTC-midnight arithmetic). */
export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** P2-109: the 7 Riyadh calendar days ending today, oldest first. */
export function riyadhTrendDays(nowMs: number = Date.now()): string[] {
  const today = riyadhDateString(nowMs);
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(addDaysToDateString(today, -i));
  return days;
}

/** P1-65: earnings revenue window = 4 Riyadh weeks (28 days) ending Riyadh-today. */
export const EARNINGS_TREND_WEEKS = 4;

/** P1-65: the 4 weekly bucket start dates (YYYY-MM-DD), oldest first; the last week ends today. */
export function riyadhTrendWeeks(nowMs: number = Date.now()): string[] {
  const today = riyadhDateString(nowMs);
  const windowStart = addDaysToDateString(today, -(EARNINGS_TREND_WEEKS * 7 - 1));
  const weeks: string[] = [];
  for (let i = 0; i < EARNINGS_TREND_WEEKS; i++) weeks.push(addDaysToDateString(windowStart, i * 7));
  return weeks;
}
