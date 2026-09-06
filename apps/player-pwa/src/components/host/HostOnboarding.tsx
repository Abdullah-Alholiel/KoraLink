'use client';

/**
 * Host Onboarding wizard — shown once before the Host a Match form.
 *
 * Six slides (hero → modes → before → during → after/rewards → ready), swipeable
 * horizontally, RTL-mirrored (swiping right in Arabic goes forward — the proven
 * PromoBillboard recipe). "Skip" and final "Start Hosting" both persist a
 * localStorage flag so the wizard never re-shows for that browser; the flag is
 * read in a mount effect (never in initial state) so server render and first
 * client render agree — no hydration mismatch (hydration-conditional-render ref).
 *
 * DESIGN (2026-09-04, Abdullah: "better colour scheme, easier for the eye";
 * 2026-09-06, Abdullah: "less AI slop — no icons, no cards"): light reading
 * surface, typography-led. One gradient hero for the brand moment; everything
 * after it is flat editorial layout — numbered sections with tabular numerals,
 * hairline dividers, green left-rules for emphasis. No icon chips, no pill
 * badges, no stacked shadow cards.
 *
 * GUIDE MODE (profile → Host Guide, /host-guide): the same slides as a
 * permanent reference. The back arrow exits WITHOUT writing the seen-flag
 * (a reference visit must not consume the real onboarding); "Start Hosting"
 * on the last slide DOES write it and (via onStartHosting) navigates straight
 * to the form — the user has just read the guidelines.
 *
 * Analytics: trackEvent is env-gated (no-ops without a PostHog key).
 */

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/providers/ObservabilityProvider';

export const HOST_ONBOARDING_SEEN_KEY = 'koralink.host-onboarding-seen.v1';

export function readHostOnboardingSeen(): boolean {
    try {
        return window.localStorage.getItem(HOST_ONBOARDING_SEEN_KEY) === '1';
    } catch {
        return false;
    }
}

export function writeHostOnboardingSeen(): void {
    try {
        window.localStorage.setItem(HOST_ONBOARDING_SEEN_KEY, '1');
    } catch {
        // Private-mode Safari — onboarding simply re-shows next visit. Non-fatal.
    }
}

/* ── Slide registry ───────────────────────────────────────────────────
 * Stable logical keys; ALL display text comes from i18n (hostOnboarding.*).
 * Titles are two dedicated line keys per locale (multi-line i18n rule —
 * never split a translated string on a word). */

type StepKey = 'hero' | 'modes' | 'before' | 'during' | 'after' | 'ready';

interface StepDef {
    key: StepKey;
    title1Key: string;
    title2Key: string;
}

const STEP_DEFS: readonly StepDef[] = [
    { key: 'hero', title1Key: 'welcomeTitleLine1', title2Key: 'welcomeTitleLine2' },
    { key: 'modes', title1Key: 'modesTitleLine1', title2Key: 'modesTitleLine2' },
    { key: 'before', title1Key: 'beforeTitleLine1', title2Key: 'beforeTitleLine2' },
    { key: 'during', title1Key: 'duringTitleLine1', title2Key: 'duringTitleLine2' },
    { key: 'after', title1Key: 'rewardsTitleLine1', title2Key: 'rewardsTitleLine2' },
    { key: 'ready', title1Key: 'successTitleLine1', title2Key: 'successTitleLine2' },
];

const TOTAL_STEPS = STEP_DEFS.length;

export default function HostOnboarding({
    onFinished,
    guide = false,
    onStartHosting,
}: {
    onFinished: () => void;
    /** Guide mode: the wizard as a permanent reference (profile → Host
     * Guide). The back arrow exits without writing the seen-flag, so
     * first-time hosts still get the real onboarding before Host a Match;
     * the exit control is a back arrow instead of "Skip". */
    guide?: boolean;
    /** Guide mode only: where "Start Hosting" goes (the /host form).
     * Finishing the guide writes the seen-flag — they just read it —
     * then navigates. Falls back to onFinished when absent. */
    onStartHosting?: () => void;
}) {
    const t = useTranslations('hostOnboarding');
    const locale = useLocale();
    const [step, setStep] = useState(0);

    /* Swipe tracking (PromoBillboard recipe) — `touch-pan-y` on the slide deck
     * lets the browser axis-lock each gesture: horizontal travel reaches us,
     * vertical travel chains to the page scroller. The swipe DECIDES in
     * touchmove (one swipe per gesture, threshold 48px) and is RTL-mirrored:
     * in Arabic the axis mirrors, so swiping RIGHT goes forward. */
    const touchStartX = useRef<number | null>(null);
    const onTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStartX.current = touch ? touch.clientX : null;
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const startX = touchStartX.current;
        if (startX == null) return;
        if (!e.touches[0]) return;
        const dx = e.touches[0].clientX - startX;
        if (Math.abs(dx) < 48) return;
        touchStartX.current = null; // one swipe per gesture
        const rtl = locale === 'ar';
        const forwardDx = rtl ? -dx : dx;
        setStep((current) => Math.min(TOTAL_STEPS - 1, Math.max(0, current + (forwardDx < 0 ? 1 : -1))));
    };
    const onTouchEnd = () => {
        touchStartX.current = null;
    };

    const finish = (via: 'skip' | 'complete') => {
        if (guide) {
            if (via === 'complete') {
                // Read the whole guide and tapped Start Hosting: the guide
                // counts — mark it seen and go straight to the form.
                writeHostOnboardingSeen();
                trackEvent('host_guide_finished', { step, locale });
                if (onStartHosting) onStartHosting();
                else onFinished();
                return;
            }
            // Back-arrow exit: a reference visit — never consume onboarding.
            trackEvent('host_guide_closed', { via, step, locale });
            onFinished();
            return;
        }
        writeHostOnboardingSeen();
        trackEvent('host_onboarding_finished', { via, step, locale });
        // The gate (same /host route) swaps the wizard for the form — no
        // navigation: router.replace to the same route would NOT remount it.
        onFinished();
    };

    const isLast = step === TOTAL_STEPS - 1;

    const slideTitle = useMemo(() => {
        const def = STEP_DEFS[step];
        return t('slideLabel', { current: step + 1, title: t(def.title1Key) });
    }, [step, t]);

    return (
        <div
            className="flex min-h-0 flex-1 flex-col bg-brand-bg"
            data-testid="host-onboarding"
            role="region"
            aria-label={t('dotsLabel')}
        >
            {/* Top bar — skip (exit) + step counter. Guide mode: back arrow
                instead of Skip; exiting never persists the seen-flag. */}
            <div className="flex flex-shrink-0 items-center justify-between px-4 pb-1 pt-[var(--top-safe-inset)]">
                {guide ? (
                    <button
                        type="button"
                        onClick={() => finish('skip')}
                        aria-label={t('guideClose')}
                        className="flex h-11 min-w-[44px] items-center justify-center rounded-full text-gray-500 transition-colors hover:text-brand-black active:scale-95"
                        data-testid="onboarding-guide-back"
                    >
                        <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" strokeWidth={2} />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => finish('skip')}
                        className="flex h-11 min-w-[44px] items-center justify-center rounded-full px-3 text-sm font-semibold text-gray-500 transition-colors hover:text-brand-black active:scale-95"
                        data-testid="onboarding-skip"
                    >
                        {t('skip')}
                    </button>
                )}
                <span className="text-xs font-semibold text-gray-400" dir="ltr">
                    {t('stepOf', { current: step + 1, total: TOTAL_STEPS })}
                </span>
            </div>

            {/* Slide deck */}
            <div
                className="flex-1 overflow-y-auto scroll-container touch-pan-y select-none"
                data-testid="onboarding-deck"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
            >
                <section
                    key={STEP_DEFS[step].key}
                    aria-label={slideTitle}
                    data-testid={`slide-${STEP_DEFS[step].key}`}
                    className="animate-fade-in-up pb-6"
                >
                    {step === 0 && <HeroSlide />}
                    {step === 1 && <ModesSlide />}
                    {step === 2 && <ChecklistSlide kind="before" />}
                    {step === 3 && <ChecklistSlide kind="during" />}
                    {step === 4 && <RewardsSlide />}
                    {step === 5 && <ReadySlide />}
                </section>
            </div>

            {/* Fixed chrome: dots + CTA */}
            <div className="flex-shrink-0 px-5 pb-safe">
                <div
                    className="mb-4 flex items-center justify-center gap-2"
                    role="tablist"
                    aria-label={t('dotsLabel')}
                >
                    {STEP_DEFS.map((def, i) => (
                        <button
                            key={def.key}
                            type="button"
                            role="tab"
                            aria-selected={i === step}
                            aria-label={t('slideLabel', {
                                current: i + 1,
                                title: t(STEP_DEFS[i].title1Key),
                            })}
                            onClick={() => setStep(i)}
                            className={`h-2 rounded-full transition-all ${
                                i === step ? 'w-6 bg-brand-green' : 'w-2 bg-gray-300 active:scale-95'
                            }`}
                            data-testid={`onboarding-dot-${i}`}
                        />
                    ))}
                </div>

                {step === 0 ? (
                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="mb-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-green py-4 text-sm font-bold text-white shadow-[0_4px_20px_rgba(27,67,50,0.4)] transition-transform active:scale-[0.98]"
                        data-testid="onboarding-get-started"
                    >
                        {t('getStarted')}
                        <ArrowRight className="h-4 w-4 rtl:-scale-x-100" strokeWidth={2.5} />
                    </button>
                ) : (
                    <div className="mb-5 flex items-center gap-3" data-testid="wizard-nav-row">
                        <button
                            type="button"
                            onClick={() => setStep((s) => Math.max(0, s - 1))}
                            aria-label={t('prevStepAria')}
                            className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-brand-black transition-transform active:scale-95"
                            data-testid="onboarding-back"
                        >
                            <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" strokeWidth={2} />
                        </button>
                        <button
                            type="button"
                            onClick={() => (isLast ? finish('complete') : setStep(step + 1))}
                            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-green text-sm font-bold text-white shadow-[0_4px_20px_rgba(27,67,50,0.4)] transition-transform active:scale-[0.98]"
                            data-testid={isLast ? 'onboarding-done' : 'onboarding-next'}
                        >
                            {isLast ? t('done') : t('next')}
                            {!isLast && <ArrowRight className="h-4 w-4 rtl:-scale-x-100" strokeWidth={2.5} />}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Slide building blocks (typography-led, no icon chips) ──────────── */

/** Section kicker label — typographic only (uppercase, tracked, green). */
function Kicker({ children }: { children: React.ReactNode }) {
    return (
        <p className="px-6 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-green">
            {children}
        </p>
    );
}

/** Slide heading — left-aligned editorial title with a green accent word. */
function StepHeading({ title1, title2, body }: { title1: string; title2: string; body?: string }) {
    return (
        <div className="px-6 pb-2 pt-6">
            <h2 className="text-[26px] font-bold leading-[1.15] text-brand-black">
                {title1} <span className="text-brand-green">{title2}</span>
            </h2>
            {body && <p className="mt-2 text-sm leading-relaxed text-gray-500">{body}</p>}
        </div>
    );
}

/** Numbered editorial item — big green numeral, bold line, one body line. */
function NumberedItem({ n, title, body }: { n: string; title: string; body: string }) {
    return (
        <li className="flex gap-4 py-3.5">
            <span
                aria-hidden
                className="w-7 flex-shrink-0 pt-0.5 text-sm font-bold tabular-nums text-brand-green"
            >
                {n}
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-bold text-brand-black">{title}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-gray-600">{body}</span>
            </span>
        </li>
    );
}

/* ── Slides ─────────────────────────────────────────────────────────── */

function HeroSlide() {
    const t = useTranslations('hostOnboarding');
    return (
        <div>
            {/* The one brand moment: gradient hero, type only. */}
            <div className="mx-4 mt-2 rounded-3xl bg-host-hero p-7 shadow-[0_10px_28px_rgba(27,50,39,0.28)]">
                <p
                    className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60"
                    data-testid="host-badge"
                >
                    {t('hostBadge')}
                </p>
                <h1 className="mt-4 text-[28px] font-bold leading-[1.15] text-white">
                    {t('welcomeTitleLine1')}{' '}
                    <span className="text-white/70">{t('welcomeTitleLine2')}</span>
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-white/80">{t('welcomeBody')}</p>
            </div>

            <p className="mt-4 px-6 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
                {t('welcomeCta')}
            </p>
            <ul className="mt-1 px-6">
                {[t('perkFreeSpot'), t('perkGuarantee'), t('perkCommunity')].map((perk) => (
                    <li
                        key={perk}
                        className="flex items-center gap-3 border-b border-gray-100 py-3 last:border-0"
                    >
                        <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-green" />
                        <span className="text-sm font-medium text-brand-black">{perk}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** One hosting mode as a flat editorial block; the recommended mode gets a
 * green left rule (logical border — mirrors in RTL). */
function ModeBlock({
    label,
    tagline,
    howTitle,
    howItems,
    rulesTitle,
    rulesItems,
    recommended,
}: {
    label: string;
    tagline: string;
    howTitle: string;
    howItems: string[];
    rulesTitle: string;
    rulesItems: string[];
    recommended?: boolean;
}) {
    return (
        <div
            className={`border-s-2 py-4 ps-4 ${
                recommended ? 'border-s-brand-green' : 'border-s-transparent'
            }`}
            data-testid="mode-card"
        >
            <h3 className="text-base font-bold text-brand-black">{label}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{tagline}</p>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-green">
                {howTitle}
            </p>
            <ol className="mt-1.5 space-y-1">
                {howItems.map((item, i) => (
                    <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-gray-600">
                        <span aria-hidden className="w-3 flex-shrink-0 text-end font-bold tabular-nums text-brand-green">
                            {i + 1}.
                        </span>
                        {item}
                    </li>
                ))}
            </ol>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                {rulesTitle}
            </p>
            <ul className="mt-1.5 space-y-1">
                {rulesItems.map((item) => (
                    <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-gray-600">
                        <span aria-hidden className="text-gray-300">–</span>
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ModesSlide() {
    const t = useTranslations('hostOnboarding');
    return (
        <div>
            <StepHeading title1={t('modesTitleLine1')} title2={t('modesTitleLine2')} body={t('modesBody')} />
            <div className="px-5">
                <ModeBlock
                    recommended
                    label={t('modeKoralinkLabel')}
                    tagline={t('modeKoralinkTagline')}
                    howTitle={t('modeKoralinkHowTitle')}
                    howItems={[t('modeKoralinkHow1'), t('modeKoralinkHow2'), t('modeKoralinkHow3')]}
                    rulesTitle={t('modeKoralinkRulesTitle')}
                    rulesItems={[t('modeKoralinkRules1'), t('modeKoralinkRules2'), t('modeKoralinkRules3')]}
                />
                <div className="h-px bg-gray-100" />
                <ModeBlock
                    label={t('modeSelfLabel')}
                    tagline={t('modeSelfTagline')}
                    howTitle={t('modeSelfHowTitle')}
                    howItems={[t('modeSelfHow1'), t('modeSelfHow2'), t('modeSelfHow3')]}
                    rulesTitle={t('modeSelfRulesTitle')}
                    rulesItems={[t('modeSelfRules1'), t('modeSelfRules2'), t('modeSelfRules3')]}
                />
            </div>
            <p className="mt-2 px-6 text-xs leading-relaxed text-gray-500">{t('modesHint')}</p>
        </div>
    );
}

function ChecklistSlide({ kind }: { kind: 'before' | 'during' }) {
    const t = useTranslations('hostOnboarding');
    const isBefore = kind === 'before';
    const items = isBefore
        ? [
              { title: t('before1Title'), body: t('before1Body') },
              { title: t('before2Title'), body: t('before2Body') },
              { title: t('before3Title'), body: t('before3Body') },
              { title: t('before4Title'), body: t('before4Body') },
          ]
        : [
              { title: t('during1Title'), body: t('during1Body') },
              { title: t('during2Title'), body: t('during2Body') },
              { title: t('during3Title'), body: t('during3Body') },
              { title: t('during4Title'), body: t('during4Body') },
          ];

    return (
        <div>
            <StepHeading
                title1={t(isBefore ? 'beforeTitleLine1' : 'duringTitleLine1')}
                title2={t(isBefore ? 'beforeTitleLine2' : 'duringTitleLine2')}
                body={t(isBefore ? 'beforeBody' : 'duringBody')}
            />
            <ul className="divide-y divide-gray-100 px-6">
                {items.map((item, i) => (
                    <NumberedItem
                        key={item.title}
                        n={String(i + 1).padStart(2, '0')}
                        title={item.title}
                        body={item.body}
                    />
                ))}
            </ul>
        </div>
    );
}

function RewardsSlide() {
    const t = useTranslations('hostOnboarding');
    return (
        <div>
            <StepHeading
                title1={t('rewardsTitleLine1')}
                title2={t('rewardsTitleLine2')}
                body={t('rewardsBody')}
            />

            {/* After the game — same numbered editorial rhythm */}
            <ul className="divide-y divide-gray-100 px-6 pb-2">
                <NumberedItem n="01" title={t('after1Title')} body={t('after1Body')} />
                <NumberedItem n="02" title={t('after2Title')} body={t('after2Body')} />
            </ul>

            <div className="mt-3 px-6">
                <Kicker>{t('rewardsTitle')}</Kicker>
                <ul className="divide-y divide-gray-100">
                    <li className="py-3.5">
                        <span className="block text-sm font-bold text-brand-black">{t('reward1Title')}</span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-gray-600">
                            {t('reward1Body')}
                        </span>
                    </li>

                    {/* Equipment — the 3-game email offer (Abdullah's requirement).
                        Emphasis = green left rule + typographic label, no pill. */}
                    <li
                        className="border-s-2 border-s-brand-green py-3.5 ps-4"
                        data-testid="equipment-reward"
                    >
                        <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-green">
                            {t('reward2Badge')}
                        </span>
                        <span className="mt-1 block text-sm font-bold text-brand-black">
                            {t('reward2Title')}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-gray-700">
                            {t('reward2Body')}
                        </span>
                    </li>

                    <li className="py-3.5">
                        <span className="block text-sm font-bold text-brand-black">{t('reward3Title')}</span>
                        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-green">
                            {t('reward3Badge')}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-gray-600">
                            {t('reward3Body')}
                        </span>
                    </li>
                </ul>
            </div>
        </div>
    );
}

function ReadySlide() {
    const t = useTranslations('hostOnboarding');
    return (
        <div>
            <div className="px-8 pb-2 pt-10 text-center">
                <h2 className="text-[26px] font-bold leading-[1.15] text-brand-black">
                    {t('successTitleLine1')} <span className="text-brand-green">{t('successTitleLine2')}</span>
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-500">{t('successBody')}</p>
            </div>
            {/* Recap — the journey as four numbered lines */}
            <ul className="mt-6 px-6">
                {[
                    t('modeKoralinkLabel'),
                    t('beforeTitleLine1'),
                    t('duringTitleLine1'),
                    t('rewardsTitle'),
                ].map((label, i) => (
                    <li
                        key={label}
                        className="flex items-center gap-4 border-b border-gray-100 py-3 last:border-0"
                    >
                        <span
                            aria-hidden
                            className="w-7 flex-shrink-0 text-sm font-bold tabular-nums text-brand-green"
                        >
                            {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm font-medium text-brand-black">{label}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
