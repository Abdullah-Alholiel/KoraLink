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
 * DESIGN (2026-09-04, Abdullah: "better colour scheme, easier for the eye"):
 * Light reading surface per HIG color/typography + accessibility contrast rules.
 * Long-form slides sit on brand-bg with white cards and gray-600 body text
 * (7.6:1 on white) — same card DNA as the rest of the app and the form that
 * follows. The brand moment is preserved as a bg-host-hero gradient CARD on the
 * light page (the PromoBillboard pattern), not a full-bleed dark screen that
 * strains the eye — and dies in outdoor sunlight.
 *
 * Analytics: trackEvent is env-gated (no-ops without a PostHog key).
 */

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
    ArrowLeft,
    ArrowRight,
    BadgeCheck,
    BellRing,
    CalendarCheck,
    Flag,
    Gift,
    Handshake,
    Package,
    Scale,
    Shield,
    Sparkles,
    Timer,
    Trophy,
    Users,
} from 'lucide-react';
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

/* ── Shared light-theme pieces ──────────────────────────────────────── */

/** Section kicker label — the ui-standards label pattern (green, uppercase). */
function Kicker({ children }: { children: React.ReactNode }) {
    return (
        <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-brand-green">
            {children}
        </p>
    );
}

function HostBadge() {
    const t = useTranslations('hostOnboarding');
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white"
            data-testid="host-badge"
        >
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            {t('hostBadge')}
        </span>
    );
}

/** Slide heading on the light surface — black title with green accent line. */
function StepHeading({ title1, title2, body }: { title1: string; title2: string; body?: string }) {
    return (
        <div className="px-6 pb-4 pt-5 text-center">
            <h2 className="text-2xl font-bold leading-tight text-brand-black">
                {title1} <span className="text-brand-green">{title2}</span>
            </h2>
            {body && <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-500">{body}</p>}
        </div>
    );
}

/** Numbered guidance item — white card, green icon chip (app card DNA). */
function GuidanceItem({
    icon,
    title,
    body,
    badge,
}: {
    icon: React.ReactNode;
    title: string;
    body: string;
    badge?: string;
}) {
    return (
        <li className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-card">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-green/10">
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-bold text-brand-black">{title}</span>
                    {badge && (
                        <span className="rounded-full bg-brand-green px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            {badge}
                        </span>
                    )}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-gray-600">{body}</span>
            </span>
        </li>
    );
}

/** Mode explainer card — grounded in the real form contract (ModeToggle). */
function ModeCard({
    icon,
    label,
    tagline,
    howTitle,
    howItems,
    rulesTitle,
    rulesItems,
    highlight,
}: {
    icon: React.ReactNode;
    label: string;
    tagline: string;
    howTitle: string;
    howItems: string[];
    rulesTitle: string;
    rulesItems: string[];
    highlight?: boolean;
}) {
    return (
        <div
            className={`rounded-2xl border p-4 shadow-card ${
                highlight ? 'border-brand-green/30 bg-brand-green/5' : 'border-gray-100 bg-white'
            }`}
            data-testid="mode-card"
        >
            <div className="flex items-center gap-3">
                <span
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                        highlight ? 'bg-brand-green' : 'bg-brand-green/10'
                    }`}
                >
                    {icon}
                </span>
                <span className="min-w-0">
                    <span className="block text-sm font-bold text-brand-black">{label}</span>
                    <span className="block text-xs text-gray-500">{tagline}</span>
                </span>
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-brand-green">{howTitle}</p>
            <ul className="mt-1.5 space-y-1">
                {howItems.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-gray-600">
                        <span aria-hidden className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-brand-green" />
                        {item}
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-brand-green">{rulesTitle}</p>
            <ul className="mt-1.5 space-y-1">
                {rulesItems.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-gray-600">
                        <BadgeCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-green" strokeWidth={2} />
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ── Main wizard ────────────────────────────────────────────────────── */

export default function HostOnboarding({
    onFinished,
    guide = false,
}: {
    onFinished: () => void;
    /** Guide mode: the wizard as a permanent reference (profile → Host
     * Guide). Exiting never writes the seen-flag, so first-time hosts
     * still get the real onboarding before Host a Match; the exit button
     * is a back arrow instead of "Skip". */
    guide?: boolean;
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
        const touch = e.touches[0];
        if (!touch) return;
        const dx = touch.clientX - startX;
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
        // Guide mode is a reference visit — it must never mark the real
        // onboarding as seen, or first-time hosts would lose it.
        if (!guide) writeHostOnboardingSeen();
        trackEvent(guide ? 'host_guide_closed' : 'host_onboarding_finished', {
            via,
            step,
            locale,
        });
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
                instead of Skip, and exiting never persists the seen-flag. */}
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

/* ── Slides ─────────────────────────────────────────────────────────── */

function HeroSlide() {
    const t = useTranslations('hostOnboarding');
    return (
        <div>
            {/* Brand moment — the host-hero gradient as a CARD on the light page
             * (PromoBillboard DNA). Short, large, high-contrast text only. */}
            <div className="mx-4 mt-2 rounded-3xl bg-host-hero p-6 text-center shadow-[0_10px_28px_rgba(27,50,39,0.28)]">
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/15 bg-white/10">
                    <Trophy className="h-10 w-10 text-white" strokeWidth={1.5} />
                </div>
                <HostBadge />
                <h1 className="mt-4 text-3xl font-bold leading-tight text-white">
                    {t('welcomeTitleLine1')} <span className="text-white/75">{t('welcomeTitleLine2')}</span>
                </h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/85">{t('welcomeBody')}</p>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-white/70">
                    {t('welcomeCta')}
                </p>
            </div>

            {/* Perks — white cards on the light surface (easy scanning) */}
            <div className="mt-5 space-y-2.5 px-5">
                <Kicker>{t('perksTitle')}</Kicker>
                {[
                    { icon: <Users className="h-4 w-4 text-brand-green" strokeWidth={2} />, label: t('perkFreeSpot') },
                    { icon: <Shield className="h-4 w-4 text-brand-green" strokeWidth={2} />, label: t('perkGuarantee') },
                    { icon: <Sparkles className="h-4 w-4 text-brand-green" strokeWidth={2} />, label: t('perkCommunity') },
                ].map((perk) => (
                    <div
                        key={perk.label}
                        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-card"
                    >
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-green/10">
                            {perk.icon}
                        </span>
                        <span className="text-sm font-semibold text-brand-black">{perk.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ModesSlide() {
    const t = useTranslations('hostOnboarding');
    return (
        <div>
            <StepHeading
                title1={t('modesTitleLine1')}
                title2={t('modesTitleLine2')}
                body={t('modesBody')}
            />
            <div className="space-y-3 px-5">
                <ModeCard
                    icon={<Shield className="h-5 w-5 text-white" strokeWidth={2} />}
                    label={t('modeKoralinkLabel')}
                    tagline={t('modeKoralinkTagline')}
                    howTitle={t('modeKoralinkHowTitle')}
                    howItems={[t('modeKoralinkHow1'), t('modeKoralinkHow2'), t('modeKoralinkHow3')]}
                    rulesTitle={t('modeKoralinkRulesTitle')}
                    rulesItems={[t('modeKoralinkRules1'), t('modeKoralinkRules2'), t('modeKoralinkRules3')]}
                    highlight
                />
                <ModeCard
                    icon={<CalendarCheck className="h-5 w-5 text-brand-green" strokeWidth={2} />}
                    label={t('modeSelfLabel')}
                    tagline={t('modeSelfTagline')}
                    howTitle={t('modeSelfHowTitle')}
                    howItems={[t('modeSelfHow1'), t('modeSelfHow2'), t('modeSelfHow3')]}
                    rulesTitle={t('modeSelfRulesTitle')}
                    rulesItems={[t('modeSelfRules1'), t('modeSelfRules2'), t('modeSelfRules3')]}
                />
                <p className="px-1 pt-1 text-xs leading-relaxed text-gray-500">{t('modesHint')}</p>
            </div>
        </div>
    );
}

function ChecklistSlide({ kind }: { kind: 'before' | 'during' }) {
    const t = useTranslations('hostOnboarding');
    const isBefore = kind === 'before';
    const items = isBefore
        ? [
              {
                  icon: <BellRing className="h-4 w-4 text-brand-green" strokeWidth={2} />,
                  title: t('before1Title'),
                  body: t('before1Body'),
              },
              {
                  icon: <Timer className="h-4 w-4 text-brand-green" strokeWidth={2} />,
                  title: t('before2Title'),
                  body: t('before2Body'),
              },
              {
                  icon: <Package className="h-4 w-4 text-brand-green" strokeWidth={2} />,
                  title: t('before3Title'),
                  body: t('before3Body'),
              },
              {
                  icon: <Handshake className="h-4 w-4 text-brand-green" strokeWidth={2} />,
                  title: t('before4Title'),
                  body: t('before4Body'),
              },
          ]
        : [
              {
                  icon: <Users className="h-4 w-4 text-brand-green" strokeWidth={2} />,
                  title: t('during1Title'),
                  body: t('during1Body'),
              },
              {
                  icon: <Flag className="h-4 w-4 text-brand-green" strokeWidth={2} />,
                  title: t('during2Title'),
                  body: t('during2Body'),
              },
              {
                  icon: <Timer className="h-4 w-4 text-brand-green" strokeWidth={2} />,
                  title: t('during3Title'),
                  body: t('during3Body'),
              },
              {
                  icon: <Scale className="h-4 w-4 text-brand-green" strokeWidth={2} />,
                  title: t('during4Title'),
                  body: t('during4Body'),
              },
          ];

    return (
        <div>
            <StepHeading
                title1={t(isBefore ? 'beforeTitleLine1' : 'duringTitleLine1')}
                title2={t(isBefore ? 'beforeTitleLine2' : 'duringTitleLine2')}
                body={t(isBefore ? 'beforeBody' : 'duringBody')}
            />
            <ul className="space-y-2.5 px-5">
                {items.map((item) => (
                    <GuidanceItem key={item.title} icon={item.icon} title={item.title} body={item.body} />
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
            {/* After-game duties */}
            <ul className="space-y-2.5 px-5">
                <GuidanceItem
                    icon={<Timer className="h-4 w-4 text-brand-green" strokeWidth={2} />}
                    title={t('after1Title')}
                    body={t('after1Body')}
                />
                <GuidanceItem
                    icon={<Handshake className="h-4 w-4 text-brand-green" strokeWidth={2} />}
                    title={t('after2Title')}
                    body={t('after2Body')}
                />
            </ul>

            {/* Rewards */}
            <div className="mt-5 px-5">
                <Kicker>{t('rewardsTitle')}</Kicker>
                <div className="space-y-2.5">
                    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-card">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-green/10">
                            <Users className="h-4 w-4 text-brand-green" strokeWidth={2} />
                        </span>
                        <span>
                            <span className="block text-sm font-bold text-brand-black">{t('reward1Title')}</span>
                            <span className="mt-1 block text-xs leading-relaxed text-gray-600">
                                {t('reward1Body')}
                            </span>
                        </span>
                    </div>

                    {/* Equipment — the 3-game email offer (Abdullah's requirement) */}
                    <div
                        className="relative overflow-hidden rounded-2xl border border-brand-green/25 bg-brand-green/5 p-3.5"
                        data-testid="equipment-reward"
                    >
                        <span className="absolute end-3 top-3 rounded-full bg-brand-green px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            {t('reward2Badge')}
                        </span>
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-green">
                                <Package className="h-4 w-4 text-white" strokeWidth={2} />
                            </span>
                            <span className="pe-16">
                                <span className="block text-sm font-bold text-brand-black">{t('reward2Title')}</span>
                                <span className="mt-1 block text-xs leading-relaxed text-gray-700">
                                    {t('reward2Body')}
                                </span>
                            </span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-card">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-green/10">
                            <Gift className="h-4 w-4 text-brand-green" strokeWidth={2} />
                        </span>
                        <span>
                            <span className="flex items-center gap-2">
                                <span className="text-sm font-bold text-brand-black">{t('reward3Title')}</span>
                                <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-green">
                                    {t('reward3Badge')}
                                </span>
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-gray-600">
                                {t('reward3Body')}
                            </span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ReadySlide() {
    const t = useTranslations('hostOnboarding');
    return (
        <div>
            <div className="flex flex-col items-center px-6 pb-2 pt-6 text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-brand-green/20 bg-brand-green/10">
                    <Trophy className="h-10 w-10 text-brand-green" strokeWidth={1.5} />
                </div>
                <h2 className="text-2xl font-bold leading-tight text-brand-black">
                    {t('successTitleLine1')} <span className="text-brand-green">{t('successTitleLine2')}</span>
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-500">{t('successBody')}</p>
            </div>
            {/* Recap strip — the whole journey at a glance */}
            <div className="mt-5 space-y-2 px-5">
                {[
                    { key: 'modes', icon: <Shield className="h-4 w-4 text-brand-green" strokeWidth={2} />, label: t('modeKoralinkLabel') },
                    { key: 'before', icon: <CalendarCheck className="h-4 w-4 text-brand-green" strokeWidth={2} />, label: t('beforeTitleLine1') },
                    { key: 'during', icon: <Flag className="h-4 w-4 text-brand-green" strokeWidth={2} />, label: t('duringTitleLine1') },
                    { key: 'after', icon: <Gift className="h-4 w-4 text-brand-green" strokeWidth={2} />, label: t('rewardsTitle') },
                ].map((chip) => (
                    <div
                        key={chip.key}
                        className="flex items-center gap-3 rounded-full border border-gray-100 bg-white px-4 py-2.5 shadow-card"
                    >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-green/10">
                            {chip.icon}
                        </span>
                        <span className="text-sm font-semibold text-brand-black">{chip.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
