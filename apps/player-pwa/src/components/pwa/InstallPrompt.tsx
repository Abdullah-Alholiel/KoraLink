'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Share, X } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { trackEvent } from '@/providers/ObservabilityProvider';
import Portal from '@/components/layout/Portal';

/**
 * Install banner: desktop Chromium gets the native beforeinstallprompt flow,
 * iOS Safari gets share-sheet instructions (no beforeinstallprompt on iOS).
 * Hidden when standalone, when not installable, or within the 7-day dismiss
 * cooldown. Rendered at the layout level; self-managing.
 */
export default function InstallPrompt() {
    const t = useTranslations('pwa.install');
    const { canInstall, isIos, shouldShowBanner, promptInstall, dismiss } = usePwaInstall();
    const [visible, setVisible] = useState(false);

    // Delay first appearance until the user has settled (2s) — never nag on
    // first paint.
    useEffect(() => {
        if (!shouldShowBanner) return;
        const timer = setTimeout(() => {
            setVisible(true);
            trackEvent('pwa_install_banner_shown', {
                platform: canInstall ? 'desktop_chromium' : 'ios_safari',
            });
        }, 2000);
        return () => clearTimeout(timer);
    }, [shouldShowBanner, canInstall]);

    if (!visible) return null;

    const handleInstall = async () => {
        if (canInstall) {
            await promptInstall();
        }
        // iOS: instructions are on the banner itself; nothing to trigger.
        setVisible(false);
    };

    const handleDismiss = () => {
        setVisible(false);
        dismiss();
    };

    return (
        <Portal>
            <div
                role="dialog"
                aria-label={t('title')}
                className="fixed bottom-[var(--floating-cta-bottom)] inset-x-0 max-w-md md:max-w-lg mx-auto px-5 z-[70]"
            >
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(32,33,36,0.18)] border border-gray-100 p-4 animate-slide-up">
                <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-green flex items-center justify-center flex-shrink-0">
                        <Download className="w-5 h-5 text-white" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-brand-black leading-tight">
                                {t('title')}
                            </h3>
                            <button
                                onClick={handleDismiss}
                                aria-label={t('notNow')}
                                className="text-gray-400 -mt-0.5 flex-shrink-0 active:scale-95 transition-transform"
                            >
                                <X className="w-4 h-4" strokeWidth={2} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            {canInstall ? t('bodyDesktop') : t('bodyIos')}
                        </p>

                        {isIos && !canInstall && (
                            <ol className="mt-2 space-y-1.5">
                                <li className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-brand-green flex-shrink-0" dir="ltr">1</span>
                                    <Share className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" strokeWidth={2} />
                                    {t('iosStepShare')}
                                </li>
                                <li className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-brand-green flex-shrink-0" dir="ltr">2</span>
                                    <span className="font-semibold text-brand-green">{t('iosStepAdd')}</span>
                                </li>
                            </ol>
                        )}

                        {canInstall && (
                            <button
                                onClick={handleInstall}
                                className="mt-2.5 w-full py-2.5 rounded-xl bg-brand-green text-white text-xs font-bold active:scale-[0.98] transition-transform"
                            >
                                {t('install')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            </div>
        </Portal>
    );
}
