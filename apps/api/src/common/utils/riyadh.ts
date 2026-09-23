/**
 * Riyadh wall-clock helpers (server-side).
 *
 * The product's calendar day is the RIYADH day (Asia/Riyadh, no DST) — the
 * same convention as the PWA's `lib/venue-hours.ts`. Keep these two files in
 * semantic sync: the pitch-slots past filter (getPitchSlots) and the
 * createMatch slot-started guard must agree with what the client renders.
 */

export const RIYADH_TIME_ZONE = 'Asia/Riyadh';

/** Riyadh-local calendar day of `now` as 'YYYY-MM-DD' (en-CA gives ISO order). */
export function riyadhDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Riyadh wall clock of `now` as 'HH:MM' (24h; h23 guards ICU "24" at midnight). */
export function riyadhTimeNow(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone: RIYADH_TIME_ZONE,
  }).format(now);
}
