/**
 * P1-25 venue operating hours — derive open/closed state from a venue's
 * per-day hours. All wall-clock reasoning is Riyadh-local by product
 * convention (the app's display timezone is Asia/Riyadh, UTC+3, no DST),
 * never the viewing device's timezone.
 */

export const RIYADH_TIME_ZONE = 'Asia/Riyadh';

export interface VenueHours {
  open_hour?: number;
  close_hour?: number;
  closed_day_0?: boolean;
  closed_day_1?: boolean;
  closed_day_2?: boolean;
  closed_day_3?: boolean;
  closed_day_4?: boolean;
  closed_day_5?: boolean;
  closed_day_6?: boolean;
}

/** Riyadh-local calendar day of `now` as 'YYYY-MM-DD' (en-CA gives ISO order). */
export function riyadhDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 0=Sunday … 6=Saturday for the Riyadh-local day of `now`. */
export function riyadhDayOfWeek(now: Date = new Date()): number {
  return new Date(`${riyadhDateKey(now)}T00:00:00Z`).getUTCDay();
}

/** Riyadh-local hour (0-23) of `now`. */
export function riyadhHour(now: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: RIYADH_TIME_ZONE,
    }).format(now),
    10,
  );
}

/**
 * Is the venue open at `now`? A closed weekday ⇒ false; otherwise
 * open_hour <= h < close_hour (close exclusive; close 24 = midnight covers
 * the 23:xx hour).
 */
export function isVenueOpenNow(v: VenueHours, now: Date = new Date()): boolean {
  const closed = v[`closed_day_${riyadhDayOfWeek(now)}` as keyof VenueHours] === true;
  if (closed) return false;
  const hour = riyadhHour(now);
  const openHour = v.open_hour ?? 0;
  const closeHour = v.close_hour ?? 24;
  return openHour <= hour && hour < closeHour;
}
