'use client';

import { useEffect } from 'react';
import { persistLocale } from '@/lib/locale-routing';
import { useAppStore } from '@/store/useAppStore';

/**
 * Keeps the persisted locale authorities in sync with the URL on every view.
 *
 * The [locale] segment of the URL is the user's strongest intent (they typed
 * it or tapped the in-app language toggle). This component writes that choice
 * into the NEXT_LOCALE cookie (what next-intl middleware reads for every
 * UNPREFIXED navigation — PWA start_url relaunches, the fetcher 401 bounce,
 * cold deep links) and the Zustand preferences slice (client UI defaults).
 *
 * Without it the cookie stays at the visitor's FIRST browser-detected locale
 * forever — e.g. `ar` on Abdullah's phone — so switching to /en worked until
 * the next unprefixed navigation snapped everything back to Arabic.
 */
export default function LocaleSync({ locale }: { locale: 'ar' | 'en' }) {
    useEffect(() => {
        persistLocale(locale);
        // Keep the persisted store's preference in sync (UI defaults, prefs display).
        if (useAppStore.getState().preferences.locale !== locale) {
            useAppStore.getState().setLocale(locale);
        }
    }, [locale]);
    return null;
}
