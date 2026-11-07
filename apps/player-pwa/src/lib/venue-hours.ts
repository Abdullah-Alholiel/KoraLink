/**
 * P1-25 venue operating hours — derive open/closed state from a venue's
 * per-day hours. All wall-clock reasoning is Riyadh-local by product
 * convention (the app's display timezone is Asia/Riyadh, UTC+3, no DST),
 * never the viewing device's timezone.
 */

export const RIYADH_TIME_ZONE = 'Asia/Riyadh';

import { resolveDateLocale, type AppLocale } from '@/lib/format';

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
      hourCycle: 'h23', // P2-35 (run #21): some ICU builds yield "24" at midnight without it
      timeZone: RIYADH_TIME_ZONE,
    }).format(now),
    10,
  );
}

/**
 * Riyadh wall clock as "HH:MM" (24h, hourCycle h23 per P2-35). Use for
 * slot start/end comparisons (host SlotPicker past-slot filtering).
 */
export function riyadhTimeNow(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone: RIYADH_TIME_ZONE,
  }).format(now);
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

/**
 * P2-281 M-1: the venue's hours for TODAY (Riyadh), or null when the venue
 * is closed today. Shares isVenueOpenNow's closed-day source of truth so
 * the card hint can never disagree with the badge.
 */
export function venueTodayHours(
  v: VenueHours,
  now: Date = new Date(),
): { openHour: number; closeHour: number } | null {
  const closed = v[`closed_day_${riyadhDayOfWeek(now)}` as keyof VenueHours] === true;
  if (closed) return null;
  return { openHour: v.open_hour ?? 0, closeHour: v.close_hour ?? 24 };
}

/** "7" → "7 AM" (en) / "٧ ص" (ar). Hour-only — venues open on whole hours. */
export function formatHourLabel(hour: number, locale: AppLocale): string {
  const h = ((hour % 24) + 24) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (locale === 'ar') {
    const period = h < 12 ? 'ص' : 'م';
    return `${new Intl.NumberFormat(resolveDateLocale(locale)).format(h12)} ${period}`;
  }
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Today's window as a localized label: "Open 7 AM – 12 AM" / "مفتوح ٧ ص – ١٢ م". */
export function formatVenueHoursWindow(
  hours: { openHour: number; closeHour: number },
  locale: AppLocale,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  return t('clubs.hoursWindow', {
    open: formatHourLabel(hours.openHour, locale),
    close: formatHourLabel(hours.closeHour, locale),
  });
}
