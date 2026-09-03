'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Sparkles, Users, type LucideIcon } from 'lucide-react';

/**
 * PromoBillboard — KoraLink's compact "billboard" surface on the Community Feed.
 *
 * Design: sketches/002-promo-billboard (Abdullah, 2026-09-03) — a carousel of
 * ONE-LINE promo slides at match-card scale (~88px), NOT a hero. Each slide is
 * fully data-driven (SLIDES config): adding a future Partner / Request-a-club
 * slide = one entry + i18n keys + a real href. No placeholder destinations —
 * slides ship only when their target page exists.
 *
 * Interaction: auto-advances every 5s (paused for prefers-reduced-motion and
 * while the tab is hidden); dots are buttons (a11y labels via promos.goToSlide).
 * The slide body is a single Link — 1 tap to the destination. Crossfade via
 * key remount (animate-fade-in-up) — no horizontal scroll, so RTL is free.
 *
 * i18n: promos.* namespace (kicker/title/sub/cta per slide + goToSlide + label).
 * Colors: bg-host-hero gradient token + brand tokens only.
 */

type SlideKey = 'host' | 'clubs';

interface Slide {
    key: SlideKey;
    href: string;
    Icon: LucideIcon;
}

/** Add future surfaces here (e.g. partner) once a real destination page exists. */
const SLIDES: Slide[] = [
    { key: 'host', href: '/host', Icon: Sparkles },
    { key: 'clubs', href: '/clubs', Icon: Users },
];

const ROTATE_MS = 5000;

export default function PromoBillboard() {
    const t = useTranslations('promos');
    const locale = useLocale();
    const [index, setIndex] = useState(0);

    const many = SLIDES.length > 1;

    useEffect(() => {
        if (!many) return;
        const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return;
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') {
                setIndex((i) => (i + 1) % SLIDES.length);
            }
        }, ROTATE_MS);
        return () => clearInterval(id);
    }, [many]);

    const slide = SLIDES[index];
    const Icon = slide.Icon;

    return (
        <section
            aria-label={t('label')}
            className="px-4 pt-1 pb-2"
            data-testid="promo-billboard"
        >
            <div
                className="overflow-hidden rounded-2xl bg-host-hero
                    shadow-[0_6px_16px_rgba(27,50,39,0.22)]"
            >
                {/* Slide body — one Link, crossfades on index change */}
                <Link
                    href={`/${locale}${slide.href}`}
                    aria-label={t(`${slide.key}.title`)}
                    className="group flex items-center gap-3 p-3
                        transition-transform active:scale-[0.985]"
                    key={slide.key}
                >
                    <span
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center
                            rounded-xl bg-white/12"
                    >
                        <Icon
                            className="h-5 w-5 text-emerald-100"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                    </span>
                    <span className="min-w-0 flex-1 animate-fade-in-up">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-100/90">
                            {t(`${slide.key}.kicker`)}
                        </span>
                        <span className="mt-0.5 block truncate text-[14.5px] font-bold leading-tight text-white">
                            {t(`${slide.key}.title`)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-white/72">
                            {t(`${slide.key}.sub`)}
                        </span>
                    </span>
                    <span
                        className="flex-shrink-0 rounded-full bg-white px-3.5 py-2 text-[11.5px] font-bold
                            text-brand-green-deep shadow-[0_3px_10px_rgba(0,0,0,0.22)]
                            transition-transform group-active:scale-[0.97]"
                    >
                        {t(`${slide.key}.cta`)}
                    </span>
                </Link>

                {/* Dots — outside the Link so they stay separate targets */}
                {many && (
                    <div className="flex items-center justify-center gap-1.5 pb-2.5">
                        {SLIDES.map((s, i) => (
                            <button
                                key={s.key}
                                onClick={() => setIndex(i)}
                                aria-label={t('goToSlide', { n: i + 1 })}
                                aria-current={i === index}
                                className={`h-1.5 rounded-full transition-all ${
                                    i === index
                                        ? 'w-4 bg-white'
                                        : 'w-1.5 bg-white/35'
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
