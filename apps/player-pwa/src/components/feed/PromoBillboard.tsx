'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Sparkles, Users, type LucideIcon } from 'lucide-react';

/**
 * PromoBillboard — KoraLink's "billboard" surface on the Community Feed.
 *
 * Design: round-1 hero visuals (sketches/001-host-button variant A) at the
 * size Abdullah approved, placed on the FEED (not Play — Abdullah, 2026-09-03
 * round 3: "use the same size as we did before, but for feed"). Rotating
 * multi-slide carousel from round 2: data-driven SLIDES config — a new slide
 * (partner, request-a-club) = one entry + `promos.<key>.*` i18n + a REAL
 * destination page. No placeholder destinations.
 *
 * Interaction: auto-advances every 5s (paused for prefers-reduced-motion and
 * hidden tabs, clock restarts after any manual navigation); dots are a11y
 * buttons OUTSIDE the Link; finger swipe changes slide (RTL-mirrored — swipe
 * right in Arabic goes forward) via pure `swipeToStep` mapping; the carousel
 * keeps `touch-pan-y` so vertical finger scrolling ALWAYS chains to the feed
 * scroller — only deliberate horizontal travel (>48px) is a swipe. Crossfade
 * via key remount (animate-fade-in-up) — RTL-safe, no horizontal translate.
 * Hrefs are locale-prefixed via useLocale().
 */

type SlideKey = 'host' | 'clubs';

interface Slide {
    key: SlideKey;
    href: string;
    Icon: LucideIcon;
    emoji: string;
    /** Optional trailing hint (e.g. host's "HOST PLAYS FREE" promise). */
    hintKey?: string;
}

/** Add future surfaces here (e.g. partner) once a real destination page exists. */
const SLIDES: Slide[] = [
    { key: 'host', href: '/host', Icon: Sparkles, emoji: '⚽', hintKey: 'host.hint' },
    { key: 'clubs', href: '/clubs', Icon: Users, emoji: '🏟️' },
];

const ROTATE_MS = 5000;
/** Deliberate horizontal travel before a drag counts as a swipe (matches
 *  the native Android ViewPager2 fling threshold). */
const SWIPE_THRESHOLD_PX = 48;

/** Maps a horizontal drag (sign carries the direction) to a carousel step.
 *  RTL-aware: in Arabic the axis mirrors, so swiping RIGHT is "next". The
 *  browser's touch AXIS-LOCK already decided this gesture is horizontal
 *  (the carousel carries `touch-pan-y`), so diagonal finger travel that
 *  leans vertical chains to the feed scroller instead — no math needed. */
export function swipeToStep(sign: number): -1 | 1 {
    return sign < 0 ? 1 : -1;
}

export default function PromoBillboard() {
    const t = useTranslations('promos');
    const locale = useLocale();
    const rtl = locale === 'ar';
    const [index, setIndex] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const many = SLIDES.length > 1;

    /* Manual navigation (swipe/dot) restarts the auto-advance clock, so a
     * slide the player just swiped to never vanishes mid-read. */
    const goTo = (i: number) => {
        setIndex(((i % SLIDES.length) + SLIDES.length) % SLIDES.length);
        if (timerRef.current) clearInterval(timerRef.current);
        // Run #32 re-arm fix: a reduced-motion user's manual swipe/dot nav
        // must not silently re-arm the auto-advance clock they opted out of.
        const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return;
        timerRef.current = setInterval(() => {
            if (document.visibilityState === 'visible') {
                setIndex((cur) => (cur + 1) % SLIDES.length);
            }
        }, ROTATE_MS);
    };

    useEffect(() => {
        if (!many) return;
        const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return;
        timerRef.current = setInterval(() => {
            if (document.visibilityState === 'visible') {
                setIndex((i) => (i + 1) % SLIDES.length);
            }
        }, ROTATE_MS);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [many]);

    /* ── Finger swipe (native-feel, scroll-safe) ──
     * `touch-pan-y` on the carousel lets the BROWSER axis-lock each gesture:
     * predominantly-vertical touch travel pans the carousel element (and
     * chains to the feed scroller) and never reaches onTouchMove as a
     * horizontal candidate; predominantly-horizontal travel is pannable
     * here, so we see it and map it to prev/next via swipeToStep (RTL-
     * mirrored). Pointer (mouse) drag is intentionally not a swipe input —
     * on desktop the Link must stay a plain click target. */
    const onTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const onTouchMove = (e: React.TouchEvent) => {
        const startX = touchStartX.current;
        if (startX == null || !many) return;
        const dx = e.touches[0].clientX - startX;
        if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
            touchStartX.current = null;
            goTo(index + swipeToStep(rtl ? -dx : dx));
        }
    };

    const onTouchEnd = () => {
        touchStartX.current = null;
    };

    const slide = SLIDES[index];

    return (
        <section
            aria-label={t('label')}
            className="px-4 pt-1 pb-2"
            data-testid="promo-billboard"
        >
            <div
                data-testid="promo-carousel"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
                className="overflow-hidden rounded-3xl bg-host-hero select-none
                    shadow-[0_10px_28px_rgba(27,50,39,0.28)] touch-pan-y"
            >
                {/* Slide body — one Link, crossfades on index change */}
                <Link
                    href={`/${locale}${slide.href}`}
                    aria-label={t(`${slide.key}.title`)}
                    className="group relative block w-full text-start
                        transition-transform active:scale-[0.985]"
                    key={slide.key}
                >
                    {/* Pitch center-circle line-art (decorative, RTL-mirrors) */}
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-14 rounded-full border border-white/30 w-[170px] h-[170px]"
                        style={{ insetInlineEnd: '-60px' }}
                    >
                        <span className="absolute inset-[18px] rounded-full border border-dashed border-white/20" />
                    </span>

                    {/* Kicker + emoji */}
                    <span className="relative flex items-start justify-between px-5 pt-4">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_0_3px_rgba(127,212,160,0.25)]" />
                            {t(`${slide.key}.kicker`)}
                        </span>
                        <span aria-hidden="true" className="animate-fade-in-up text-[26px] leading-none">
                            {slide.emoji}
                        </span>
                    </span>

                    {/* Title + hook */}
                    <span className="relative block px-5 mt-1 animate-fade-in-up">
                        <span className="block text-[22px] leading-tight font-extrabold text-white">
                            {t(`${slide.key}.title`)}
                        </span>
                        <span className="block mt-1 text-[13px] text-white/80">
                            {t(`${slide.key}.sub`)}
                        </span>
                    </span>

                    {/* CTA + optional hint */}
                    <span className="relative flex items-center gap-3 px-5 pt-3 pb-4">
                        <span
                            className="inline-flex items-center gap-2 rounded-full bg-white px-[18px] py-[11px]
                                text-[13px] font-bold text-brand-green-deep shadow-[0_6px_16px_rgba(0,0,0,0.25)]
                                transition-transform group-active:scale-[0.97]"
                        >
                            {t(`${slide.key}.cta`)}
                        </span>
                        {slide.hintKey && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/75">
                                <slide.Icon className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                                {t(slide.hintKey)}
                            </span>
                        )}
                    </span>
                </Link>

                {/* Dots — outside the Link so they stay separate targets */}
                {many && (
                    <div className="relative flex items-center justify-center gap-1.5 pb-2.5">
                        {SLIDES.map((s, i) => (
                            <button
                                key={s.key}
                                onClick={() => goTo(i)}
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
