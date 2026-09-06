/**
 * Locale-aware display formatters for the KoraLink PWA.
 * These mirror the existing `dateInRiyadh`/`fmtTime` helpers in api-adapter.ts:
 * pure formatting utilities that respect the active locale (RTL-aware numbers).
 */

export type AppLocale = 'ar' | 'en';

function numberFormat(locale: AppLocale, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', opts);
}

// Force Gregorian calendar for Arabic — some engines default `ar-SA` to the
// Islamic (Hijri) calendar, which would render the wrong month/year.
function dateLocale(locale: AppLocale): string {
  return locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB';
}

/**
 * Formats a distance in metres as a human-readable, locale-aware string.
 *
 *   850  → "850 m"  (en) / "٨٥٠ م" (ar)
 *   3200 → "3.2 km" (en) / "٣٫٢ كم" (ar)
 *   null/undefined/NaN → null (caller hides the badge)
 */
export function formatDistance(
  meters: number | null | undefined,
  locale: AppLocale,
): string | null {
  if (meters == null || Number.isNaN(meters)) return null;

  if (meters < 1000) {
    const value = numberFormat(locale, { maximumFractionDigits: 0 }).format(
      Math.round(meters),
    );
    return locale === 'ar' ? `${value} م` : `${value} m`;
  }

  const value = numberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(meters / 1000);
  return locale === 'ar' ? `${value} كم` : `${value} km`;
}

/**
 * Formats a `YYYY-MM-DD` calendar date as a full "day name, number month year"
 * section header, in Asia/Riyadh so the date never shifts across timezones.
 *
 *   "2026-08-15" → "Friday, 15 August 2026" (en) / "الجمعة، ١٥ أغسطس ٢٠٢٦" (ar)
 */
export function formatDateSection(dateStr: string, locale: AppLocale): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(dateLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  }).format(date);
}

/**
 * Compact relative time for feed/activity timestamps.
 *   "now" / "5m ago" / "3h ago" / "2d ago" / "15 Aug" (en)
 *   "الآن" / "منذ ٥ د" / "منذ ٣ س" / "منذ يومين" / "١٥ أغسطس" (ar)
 */
export function formatRelativeTime(iso: string, locale: AppLocale): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);

  if (Number.isNaN(mins) || mins < 1) return locale === 'ar' ? 'الآن' : 'now';
  if (mins < 60) return locale === 'ar' ? `منذ ${mins} د` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return locale === 'ar' ? `منذ ${hours} س` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return locale === 'ar' ? `منذ ${days} يوم` : `${days}d ago`;

  return new Intl.DateTimeFormat(dateLocale(locale), {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export interface TimeLeft {
  /** Localized display chunk, e.g. "5h 32m" (en) / "٥ س ٣٢ د" (ar). */
  text: string;
  /** Whole minutes remaining (floor). 0 when under a minute. */
  minutesLeft: number;
}

/**
 * Time remaining until a future deadline, as a localized countdown chunk for
 * the POTM voting window. Returns null when the deadline has passed (or the
 * input is invalid) — the caller decides how to present the ended state.
 *
 *   +5h32m → "5h 32m" (en) / "٥ س ٣٢ د" (ar)
 *   +12m   → "12m"    (en) / "١٢ د"     (ar)
 *   +30s   → "under a minute" (en) / "أقل من دقيقة" (ar)
 */
export function formatTimeLeft(
  target: Date | string,
  locale: AppLocale,
  now: Date = new Date(),
): TimeLeft | null {
  const end = typeof target === 'string' ? new Date(target) : target;
  const ms = end.getTime() - now.getTime();
  if (Number.isNaN(end.getTime()) || ms <= 0) return null;

  const totalMins = Math.floor(ms / 60_000);
  const nf = numberFormat(locale, { maximumFractionDigits: 0 });
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  let text: string;
  if (hours >= 1) {
    text =
      locale === 'ar'
        ? `${nf.format(hours)} س ${nf.format(mins)} د`
        : `${hours}h ${mins}m`;
  } else if (totalMins >= 1) {
    text = locale === 'ar' ? `${nf.format(totalMins)} د` : `${totalMins}m`;
  } else {
    text = locale === 'ar' ? 'أقل من دقيقة' : 'under a minute';
  }
  return { text, minutesLeft: totalMins };
}

/**
 * Formats a clock time in Asia/Riyadh (the app's display timezone) for the
 * active locale — e.g. "7:00 PM" (en) / "٧:٠٠ م" (ar). Used for the host's
 * "available at {time}" lifecycle hints on the match detail page.
 */
export function formatClockTime(date: Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Riyadh',
  }).format(date);
}
