'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { PartyPopper } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import Portal from '@/components/layout/Portal';

/**
 * Welcome checkpoint (Gate 3 §4): first standalone launch after install →
 * full-viewport celebratory overlay via Portal (body-level stacking, iOS-safe).
 *
 * Once-only by contract:
 *  - CTA tap → markWelcomeSeen() (writes BOTH gate keys in one call).
 *  - 10s safety-net timer → markAppSeen() even if the user closed the app
 *    before tapping (next launch is a returning user; no nag).
 */
export default function WelcomeCheckpoint() {
    const t = useTranslations('pwa.welcome');
    const { shouldShowWelcome, markWelcomeSeen, markAppSeen } = usePwaInstall();

    useEffect(() => {
        if (!shouldShowWelcome) return;
        // 10s safety net (Gate 3 §1.2).
        const safetyNet = setTimeout(() => markAppSeen(), 10_000);
        return () => clearTimeout(safetyNet);
    }, [shouldShowWelcome, markAppSeen]);

    if (!shouldShowWelcome) return null;

    const handleContinue = () => markWelcomeSeen();

    return (
        <Portal>
            <div
                role="dialog"
                aria-label={t('title')}
                className="fixed inset-0 z-[90] bg-brand-green flex items-center justify-center px-5"
            >
                <div className="animate-spring-in flex flex-col items-center text-center max-w-sm">
                    <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.3)] active:scale-95 transition-transform">
                        <PartyPopper className="w-10 h-10 text-brand-green" strokeWidth={1.5} />
                    </div>
                    <h1 className="mt-6 text-2xl font-extrabold text-white leading-tight">
                        {t('title')}
                    </h1>
                    <p className="mt-2 text-sm text-white/85 leading-relaxed">
                        {t('subtitle')}
                    </p>
                    <button
                        onClick={handleContinue}
                        className="mt-8 w-full py-4 rounded-2xl bg-white text-brand-green text-sm font-bold
                          active:scale-[0.98] transition-transform
                          shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
                    >
                        {t('cta')}
                    </button>
                </div>
            </div>
        </Portal>
    );
}
