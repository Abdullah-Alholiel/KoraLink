'use client';

import { useCallback, useEffect, useState } from 'react';
import { trackEvent } from '@/providers/ObservabilityProvider';

/** beforeinstallprompt event shape (not in standard TS DOM libs). */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'koralink.install-banner-dismissed-at';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readDismissedAt(): number {
    try {
        const raw = window.localStorage.getItem(DISMISS_KEY);
        return raw ? Number(raw) : 0;
    } catch {
        return 0; // private mode etc. — treat as never dismissed
    }
}

export function usePwaInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isStandalone, setIsStandalone] = useState(true); // SSR-safe default: hidden
    const [isIos, setIsIos] = useState(false);
    const [dismissedRecently, setDismissedRecently] = useState(true); // SSR-safe: hidden until checked

    useEffect(() => {
        // Standalone detection: matchMedia display-mode OR iOS navigator.standalone.
        const mq = window.matchMedia('(display-mode: standalone)');
        const nav = navigator as Navigator & { standalone?: boolean };
        const updateStandalone = () => setIsStandalone(mq.matches || nav.standalone === true);
        updateStandalone();
        mq.addEventListener('change', updateStandalone);

        setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent));

        // Cooldown check on mount (and on visibilitychange for returning tabs).
        const checkCooldown = () =>
            setDismissedRecently(Date.now() - readDismissedAt() < COOLDOWN_MS);
        checkCooldown();
        document.addEventListener('visibilitychange', checkCooldown);

        // Chromium fires beforeinstallprompt once per load when installable.
        const onBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

        // App was installed — the browser fires appinstalled once.
        const onAppInstalled = () => {
            setDeferredPrompt(null);
            trackEvent('pwa_install_accepted', { platform: 'browser_event' });
        };
        window.addEventListener('appinstalled', onAppInstalled);

        return () => {
            mq.removeEventListener('change', updateStandalone);
            document.removeEventListener('visibilitychange', checkCooldown);
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
            window.removeEventListener('appinstalled', onAppInstalled);
        };
    }, []);

    const canInstall = deferredPrompt !== null;

    const shouldShowBanner =
        !isStandalone && !dismissedRecently && (canInstall || isIos);

    const promptInstall = useCallback(async (): Promise<boolean> => {
        if (!deferredPrompt) return false;
        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            trackEvent('pwa_install_prompt_result', { outcome });
            if (outcome === 'dismissed') setDeferredPrompt(null);
            return outcome === 'accepted';
        } catch {
            return false;
        }
    }, [deferredPrompt]);

    const dismiss = useCallback(() => {
        try {
            window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
            // storage unavailable — banner just hides for this session
        }
        setDismissedRecently(true);
        trackEvent('pwa_install_dismissed', {
            platform: isIos && !canInstall ? 'ios_safari' : 'desktop_chromium',
        });
    }, [canInstall, isIos]);

    return {
        canInstall,
        isStandalone,
        isIos,
        shouldShowBanner,
        promptInstall,
        dismiss,
    };
}
