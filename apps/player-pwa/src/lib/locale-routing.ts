/**
 * Single source of truth for locale persistence + locale-aware navigation.
 *
 * WHY THIS EXISTS (2026-09-11 language-toggle incident): the app had FIVE
 * locale authorities that disagreed — the URL path, the NEXT_LOCALE cookie
 * (never written by any code path, so it stayed at the visitor's FIRST
 * detected locale forever), Zustand preferences.locale (default 'ar'),
 * AuthBootstrap's hardcoded locale:'en', and the fetcher 401 self-heal
 * bouncing to bare '/login' (middleware re-detects the stale cookie → snaps
 * the user back). Tapping the login language toggle changed only the URL;
 * the next unprefixed navigation reverted the whole UI. Every locale
 * write/read goes through here now:
 *
 *   URL (strongest intent) ── persistLocale ──► NEXT_LOCALE cookie
 *        │                                        (read by next-intl
 *        └─► Zustand preferences.locale           middleware on every
 *            (client UI defaults)                 unprefixed navigation:
 *                                             PWA start_url, 401 bounce,
 *                                             share-target, cold deep link)
 */

export type AppLocale = 'ar' | 'en';

export const normalizeLocale = (v: unknown): AppLocale => (v === 'en' ? 'en' : 'ar');

/** Locale from the current URL path (`/ar/...` → 'ar'); 'ar' when absent/SSR. */
export const localeFromPath = (): AppLocale => {
    if (typeof window === 'undefined') return 'ar';
    return normalizeLocale(window.location.pathname.split('/')[1]);
};

/**
 * Persist the user's locale choice: the NEXT_LOCALE cookie (what next-intl
 * middleware reads for every unprefixed request) plus a localStorage mirror
 * (cookie-blocked browsers / explicit reads).
 */
export const persistLocale = (locale: AppLocale): void => {
    if (typeof window === 'undefined') return;
    // 1 year, all paths, SameSite=Lax — same posture next-intl's own cookie
    // documentation recommends; it must survive standalone relaunches.
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try {
        localStorage.setItem('koralink_locale', locale);
    } catch {
        // Private mode etc. — the cookie is the source of truth.
    }
};

/** Read the persisted locale (cookie first, localStorage mirror fallback). */
export const readPersistedLocale = (): AppLocale => {
    if (typeof window === 'undefined') return 'ar';
    const m = /(?:^|;\s*)NEXT_LOCALE=(ar|en)(?:;|$)/.exec(document.cookie);
    if (m) return normalizeLocale(m[1]);
    try {
        return normalizeLocale(localStorage.getItem('koralink_locale'));
    } catch {
        return 'ar';
    }
};

/**
 * Navigate to `path` (locale-prefixed OR bare, e.g. '/login') and persist the
 * user's locale choice FIRST so the middleware agrees with the destination:
 * an explicitly-prefixed path (e.g. '/ar/login') persists ITS locale — that
 * prefix IS the user's intent; a bare path keeps the CURRENT URL's locale.
 * Replaces every bare `window.location.href = '/login'` style bounce — those
 * are what re-Arabicized users after the 401 self-heal.
 */
export const navigatePreservingLocale = (path: string): void => {
    if (typeof window === 'undefined') return;
    const m = /^\/(ar|en)(\/|$)/.exec(path);
    const locale: AppLocale = m ? normalizeLocale(m[1]) : localeFromPath();
    persistLocale(locale);
    const prefixed = m ? path : `/${locale}${path === '/' ? '' : path}`;
    window.location.assign(prefixed);
};
