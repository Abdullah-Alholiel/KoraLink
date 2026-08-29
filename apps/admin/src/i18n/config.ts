export const ADMIN_LOCALES = ['en', 'ar'] as const;

export type AdminLocale = (typeof ADMIN_LOCALES)[number];

export const ADMIN_LOCALE_KEY = 'admin_locale';

export function isAdminLocale(value: unknown): value is AdminLocale {
  return value === 'en' || value === 'ar';
}

/** Read the persisted locale (client only; safe on the server). */
export function getStoredLocale(): AdminLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    const v = window.localStorage.getItem(ADMIN_LOCALE_KEY);
    return isAdminLocale(v) ? v : 'en';
  } catch {
    return 'en';
  }
}

/** Persist the locale (no-op where storage is unavailable). */
export function storeLocale(locale: AdminLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMIN_LOCALE_KEY, locale);
  } catch {
    // private mode / storage disabled — locale stays session-only
  }
}

/** Apply lang/dir to <html> (the layout also runs an inline pre-hydration script). */
export function applyDocumentLocale(locale: AdminLocale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}
