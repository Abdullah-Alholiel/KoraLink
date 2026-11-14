// P2-124 (run #86): shared week-window helpers for the pitch schedule drawers.
//
// Windows are computed from LOCAL calendar fields (the console's display clock
// is the user's Asia/Riyadh time) and serialized back in that same local zone.
// toISOString() here would shift a Riyadh Sunday-midnight to Saturday UTC and
// pull the slot grid / from-to query window one day early (PR-Agent TZ finding
// on PR #51 — the formula predates the PR but now lives in ONE place).

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Sunday of the week containing `now` (local), as YYYY-MM-DD. */
export function weekStart(now = new Date()): string {
  return toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()));
}

/** Saturday of the week containing `now` (local), as YYYY-MM-DD. */
export function weekEnd(now = new Date()): string {
  return toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 6));
}

/** YYYY-MM-DD plus N days (local calendar math on a date key). */
export function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalDateKey(d);
}
