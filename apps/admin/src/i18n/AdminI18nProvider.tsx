'use client';

import { useEffect, useMemo } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { initAdminLocale } from '@/i18n/locale-store';
import { useAdminLocale } from '@/i18n/locale-store';

const MESSAGES = { en, ar } as const;

/**
 * Client-side i18n provider for the admin console.
 *
 * Server render always uses `en` (static `<html lang="en">` matches),
 * then the provider swaps locale + messages on mount from the persisted
 * `admin_locale` value — no hydration mismatch because the swap happens
 * in an effect after hydration, and the html dir flip is handled by the
 * pre-hydration script in the root layout (no LTR flash).
 */
export default function AdminI18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useAdminLocale();

  useEffect(() => {
    initAdminLocale();
  }, []);

  const messages = useMemo(() => MESSAGES[locale] ?? en, [locale]);

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {children}
    </NextIntlClientProvider>
  );
}
