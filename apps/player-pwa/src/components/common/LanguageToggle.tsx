'use client';

/**
 * LanguageToggle — the ONE language switcher for the whole app (2026-09-17).
 *
 * A two-segment "ع | EN" pill: the current language is the pressed segment
 * (`aria-pressed`), tapping the other segment switches. Replaces both the
 * bare globe icon on the login header and the profile row that fired on a
 * single click — Abdullah asked for a toggle you PRESS, consistent on both
 * surfaces.
 *
 * Locale mechanics (do NOT bypass): the actual switch goes through
 * navigatePreservingLocale, which persists NEXT_LOCALE + the localStorage
 * mirror and full-reloads so the server re-renders with the right i18n
 * bundle (language-toggle incident 2026-09-11 — router.push() reused the
 * cached RSC and the stale NEXT_LOCALE cookie snapped the UI back).
 *
 * The component is SELF-LOCATING: it swaps the first path segment of the
 * current URL, so the same component works on /login, /profile, or any
 * [locale] route without props drilling the path. The query string is read
 * from window.location AT CLICK TIME (client-only event) — deliberately NO
 * useSearchParams, which would force a Suspense boundary on every static
 * page that embeds this toggle.
 *
 * i18n: renders the ENDONYMS (ع / EN) — a language switcher never
 * translates itself (same reason 'English' stays English in an Arabic UI).
 */

import { usePathname } from 'next/navigation';
import { navigatePreservingLocale } from '@/lib/locale-routing';

export type ToggleLocale = 'ar' | 'en';

interface LanguageToggleProps {
    /** Visual size of the pill. `sm` = login header, `md` = profile row. */
    size?: 'sm' | 'md';
    /** Localized group aria-label (endonyms on the segments are universal). */
    ariaLabel?: string;
}

export default function LanguageToggle({ size = 'sm', ariaLabel = 'Language' }: LanguageToggleProps) {
    const pathname = usePathname() ?? '';

    // Current locale = first path segment (the [locale] layout guarantees it).
    // Default 'en' mirrors normalizeLocale's fallback.
    const current = (pathname.split('/')[1] === 'en' ? 'en' : 'ar') as ToggleLocale;

    const switchTo = (to: ToggleLocale) => {
        if (typeof window === 'undefined') return;
        if (to === current) return; // already there — toggle, don't reload
        const segments = pathname.split('/');
        segments[1] = to; // locale is always segment 1 in the [locale] layout
        navigatePreservingLocale(`/${segments.slice(1).join('/')}${window.location.search}`);
    };

    const heights = size === 'md' ? 'h-10' : 'h-9';
    const segH = size === 'md' ? 'h-8' : 'h-7';

    return (
        <div
            role="group"
            aria-label={ariaLabel}
            data-testid="language-toggle"
            className={`inline-flex items-center rounded-full border border-gray-200 bg-white p-0.5 ${heights}`}
        >
            {(['ar', 'en'] as const).map((loc) => {
                const active = loc === current;
                return (
                    <button
                        key={loc}
                        type="button"
                        aria-pressed={active}
                        aria-label={loc === 'ar' ? 'العربية' : 'English'}
                        onClick={() => switchTo(loc)}
                        className={`${segH} min-w-[44px] px-2.5 rounded-full text-[13px] font-bold flex items-center justify-center transition-all active:scale-[0.97] ${
                            active
                                ? 'bg-brand-green text-white shadow-[0_1px_4px_rgba(37,65,50,0.3)]'
                                : 'text-gray-500'
                        }`}
                    >
                        {loc === 'ar' ? 'ع' : 'EN'}
                    </button>
                );
            })}
        </div>
    );
}
