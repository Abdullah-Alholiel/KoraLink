import { getRequestConfig } from 'next-intl/server';
import en from '@/messages/en.json';

/**
 * Admin i18n request config.
 *
 * The console is client-authenticated with the locale persisted in
 * localStorage (`admin_locale`), so the SERVER render is always `en`
 * (matches the static `<html lang="en">` first paint — no hydration
 * mismatch). The client `I18nProvider` swaps locale+messages after
 * mount from the persisted value; a pre-hydration inline script in the
 * root layout flips <html lang/dir> before first paint to avoid an
 * LTR flash for Arabic users.
 */
export default getRequestConfig(async () => ({
  locale: 'en',
  messages: en,
}));
