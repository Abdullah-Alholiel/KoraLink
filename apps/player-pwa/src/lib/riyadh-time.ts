/**
 * Riyadh-timezone date helpers (P2-153 hex fold, run #124).
 *
 * Domain-pure: no fetch, no socket, no adapter types. The app's display
 * timezone is Asia/Riyadh (set in i18n/request.ts); using the UTC ISO date
 * instead would mislabel matches that start before 03:00 Riyadh time.
 *
 * Extracted from lib/api-adapter.ts, which re-exports these for back-compat —
 * new code should import from here (components must never import the adapter).
 */

/** Formats a date as YYYY-MM-DD in Asia/Riyadh — the app's display timezone
 *  (set in i18n/request.ts). Using the UTC ISO date instead would mislabel
 *  matches that start before 03:00 Riyadh time. */
export function dateInRiyadh(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Today's date (YYYY-MM-DD) in Asia/Riyadh — pair with dateInRiyadh(). */
export function todayInRiyadh(): string {
  return dateInRiyadh(new Date());
}

/** Build an ISO timestamp from a Riyadh-local "YYYY-MM-DD" date and "HH:MM"
 *  time. Riyadh is UTC+3 with no DST, so the offset is constant. The host form
 *  must use this (not `new Date(`${date}T${time}`)`) so kick-off is stored
 *  correctly regardless of the device's local timezone. */
export function riyadhISO(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const asUTC = Date.UTC(y, m - 1, d, hh - 3, mm);
  return new Date(asUTC).toISOString();
}

/** Validate a `?date=` query param for the host form (e.g. passed from the
 *  club calendar). Accepts only YYYY-MM-DD strings that are today-or-later in
 *  Asia/Riyadh; anything else (garbage, past dates) is ignored → null, so a
 *  bad param never blocks or corrupts the form. */
export function parseHostDateParam(
  raw: string | null | undefined,
  today: string = todayInRiyadh(),
): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  // ISO dates compare chronologically as strings.
  return raw >= today ? raw : null;
}
