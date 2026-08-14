/**
 * Locale-aware display formatters for the KoraLink PWA.
 * These mirror the existing `dateInRiyadh`/`fmtTime` helpers in api-adapter.ts:
 * pure formatting utilities that respect the active locale (RTL-aware numbers).
 */

export type AppLocale = 'ar' | 'en';

function numberFormat(locale: AppLocale, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', opts);
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
