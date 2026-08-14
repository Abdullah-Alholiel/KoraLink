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
