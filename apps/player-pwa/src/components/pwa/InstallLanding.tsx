'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Globe, Share, Smartphone, X } from 'lucide-react';
import { usePwaInstall, classifyPlatform } from '@/hooks/usePwaInstall';
import { trackEvent } from '@/providers/ObservabilityProvider';
import Portal from '@/components/layout/Portal';

/**
 * Shots.so-style install landing (Gate 3 §3) — full-viewport overlay rendered
 * by InstallLandingGuard over the app shell (which stays mounted underneath).
 *
 * CTA matrix:
 *  - chromium (beforeinstallprompt captured): fires the native install prompt.
 *  - ios (no BIP on iOS): OS-correct 2-step cheat-sheet cards + continue CTA.
 *  - other (desktop Safari/Firefox): value pitch + continue CTA (no fake
 *    install promise).
 * `ctaContinue` renders in EVERY state — bypass is always one tap away.
 */
export default function InstallLanding() {
    const t = useTranslations('pwa.landing');
    const { canInstall, isIos, promptInstall, dismissLanding } = usePwaInstall();

    const [mode, setMode] = useState<'checking' | 'visible' | 'declined'>('checking');

    useEffect(() => {
        setMode('visible');
        trackEvent('pwa_install_landing_shown', {
            platform: classifyPlatform(navigator.userAgent, canInstall),
        });
        // Mount-once: track the shown event exactly once per mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleInstall = useCallback(async () => {
        trackEvent('pwa_install_landing_cta_clicked', {
            platform: classifyPlatform(navigator.userAgent, canInstall),
            cta: 'install',
        });
        await promptInstall();
        // accepted → appinstalled fires + standalone flips via focus/visibility
        // listeners → guard swaps to app (no reload). dismissed → user can
        // still tap the continue CTA below.
    }, [canInstall, promptInstall]);

    const handleContinue = useCallback(() => {
        trackEvent('pwa_install_landing_cta_clicked', {
            platform: classifyPlatform(navigator.userAgent, canInstall),
            cta: 'continue',
        });
        setMode('declined');
    }, [canInstall]);

    const handleNotNow = useCallback(() => {
        dismissLanding(); // 30d flag + funnel event
        setMode('declined');
    }, [dismissLanding]);

    if (mode === 'checking' || mode === 'declined') return null;

    return (
        <Portal>
            <div
                role="dialog"
                aria-label={t('title')}
                className="fixed inset-0 z-[90] bg-brand-bg overflow-y-auto scroll-container"
            >
            <div className="min-h-full flex flex-col max-w-2xl mx-auto w-full">
                {/* ── Hero ─────────────────────────────────────────────── */}
                <div className="bg-brand-green pt-[var(--top-safe-inset)] pb-10 px-5 rounded-b-[2rem]">
                    <div className="flex items-start justify-between">
                        <span className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white">
                            <Smartphone className="w-3.5 h-3.5" strokeWidth={2} />
                            {t('heroBadge')} · {t('heroBadgeLabel')}
                        </span>
                        <button
                            onClick={handleNotNow}
                            aria-label={t('notNow')}
                            className="text-white/80 active:scale-95 transition-transform"
                        >
                            <X className="w-5 h-5" strokeWidth={2} />
                        </button>
                    </div>

                    <div className="mt-6 flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.25)] flex-shrink-0 active:scale-95 transition-transform">
                            <Download className="w-8 h-8 text-brand-green" strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-extrabold text-white leading-tight">
                                {t('title')}
                            </h1>
                            <p className="text-sm text-white/80 mt-1 leading-relaxed">
                                {t('subtitle')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── iOS cheat-sheet (Gate 3 §3, iOS-only) ────────────── */}
                {isIos && !canInstall && (
                    <div className="px-5 -mt-5 animate-spring-in max-w-md mx-auto w-full">
                        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(32,33,36,0.18)] p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <span
                                    dir="ltr"
                                    className="w-6 h-6 rounded-full bg-brand-green text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                                >
                                    {t('iosStepOne')}
                                </span>
                                <Share className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                                <p className="text-sm text-brand-black">{t('iosStepOneLabel')}</p>
                            </div>
                            <div className="h-px bg-gray-100" />
                            <div className="flex items-center gap-3">
                                <span
                                    dir="ltr"
                                    className="w-6 h-6 rounded-full bg-brand-green text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                                >
                                    {t('iosStepTwo')}
                                </span>
                                <Download className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                                <p className="text-sm text-brand-black">{t('iosStepTwoLabel')}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Value rows ───────────────────────────────────────── */}
                <div className="px-5 mt-5 space-y-3 animate-spring-in max-w-md mx-auto w-full" style={{ animationDelay: '60ms' }}>
                    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                        <Globe className="w-5 h-5 text-brand-green flex-shrink-0" strokeWidth={2} />
                        <p className="text-sm text-brand-black">{t('benefitOne')}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                        <Smartphone className="w-5 h-5 text-brand-green flex-shrink-0" strokeWidth={2} />
                        <p className="text-sm text-brand-black">{t('benefitTwo')}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                        <Download className="w-5 h-5 text-brand-green flex-shrink-0" strokeWidth={2} />
                        <p className="text-sm text-brand-black">{t('benefitThree')}</p>
                    </div>
                </div>

                {/* ── CTAs ─────────────────────────────────────────────── */}
                <div className="px-5 mt-auto pb-[var(--top-safe-inset)] pt-6 max-w-md mx-auto w-full">
                    {canInstall ? (
                        <button
                            onClick={handleInstall}
                            className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
                              flex items-center justify-center gap-2
                              shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                              active:scale-[0.98] transition-transform"
                        >
                            <Download className="w-5 h-5" strokeWidth={2} />
                            {t('ctaChromium')}
                        </button>
                    ) : (
                        <button
                            onClick={handleContinue}
                            className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold
                              flex items-center justify-center gap-2
                              shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                              active:scale-[0.98] transition-transform"
                        >
                            <Globe className="w-5 h-5" strokeWidth={2} />
                            {t('ctaContinue')}
                        </button>
                    )}
                    {canInstall && (
                        <button
                            onClick={handleContinue}
                            className="mt-2 w-full py-3 rounded-2xl bg-white border border-gray-200 text-brand-black
                              text-sm font-semibold active:scale-[0.98] transition-transform"
                        >
                            {t('ctaContinue')}
                        </button>
                    )}
                    <p className="mt-3 text-center text-xs text-gray-400">{t('notNowNote')}</p>
                </div>
            </div>
            </div>
        </Portal>
    );
}
