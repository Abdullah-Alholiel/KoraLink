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

// ─── Install-landing + welcome state (03-program-design §1 / §1.2) ──────────
const LANDING_DISMISS_KEY = 'koralink.install-landing-dismissed-at';
const LANDING_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const WELCOME_SEEN_KEY = 'koralink.pwa-welcome-seen';
const SEEN_APP_BEFORE_KEY = 'koralink.pwa-seen-app-before';

// Returning-user evidence: any of these keys present ⇒ this storage has used
// the app before (zustand persist root, prior banner/landing dismissal). This
// is what keeps the welcome checkpoint from nagging EXISTING standalone users
// after they upgrade (Gate 3 §1.2).
const LEGACY_EVIDENCE_KEYS = ['koralink-app-store', 'persist:root', DISMISS_KEY, LANDING_DISMISS_KEY];

export type PwaPlatform = 'chromium' | 'ios' | 'other';

function readDismissedAt(key: string): number {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? Number(raw) : 0;
    } catch {
        return 0; // private mode etc. — treat as never dismissed
    }
}

function writeKey(key: string) {
    try {
        window.localStorage.setItem(key, String(Date.now()));
    } catch {
        // storage unavailable — state simply doesn't persist
    }
}

/** Platform classifier for the landing CTA matrix (Gate 3 §3):
 *  ios (no BIP) | chromium (BIP-capable) | other (desktop Safari/Firefox). */
export function classifyPlatform(ua: string, canInstall: boolean): PwaPlatform {
    if (canInstall) return 'chromium';
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Chrom(e|ium)|Edg\//.test(ua)) return 'chromium';
    return 'other';
}

function hasAnyKey(keys: string[]): boolean {
    try {
        return keys.some((k) => window.localStorage.getItem(k) !== null);
    } catch {
        return false;
    }
}

export function usePwaInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isStandalone, setIsStandalone] = useState(true); // SSR-safe default: hidden
    const [isIos, setIsIos] = useState(false);
    const [dismissedRecently, setDismissedRecently] = useState(true); // SSR-safe: hidden until checked
    const [landingDismissedRecently, setLandingDismissedRecently] = useState(true);
    const [hasSeenAppBefore, setHasSeenAppBefore] = useState(true);
    // True once `appinstalled` fired this session: the welcome flag was removed
    // from storage, so the gate must re-open EVEN IF hasSeenAppBefore didn't
    // change (false → false is a React state no-op — without this, no re-render
    // happens and shouldShowWelcome stays stale, breaking the install→greet
    // handoff; caught by test 'appinstalled clears the welcome flag').
    const [welcomeCleared, setWelcomeCleared] = useState(false);

    useEffect(() => {
        // Standalone detection: matchMedia display-mode OR iOS navigator.standalone.
        // Re-evaluated on focus/visibilitychange → post-install handoff: when the
        // user accepts the native install dialog and returns to the tab, the
        // standalone media query flips — the landing overlay swaps to the app
        // WITHOUT a reload (Gate 3 §1).
        const mq = window.matchMedia('(display-mode: standalone)');
        const nav = navigator as Navigator & { standalone?: boolean };
        const updateStandalone = () =>
            setIsStandalone(mq.matches || nav.standalone === true);
        updateStandalone();
        mq.addEventListener('change', updateStandalone);
        window.addEventListener('focus', updateStandalone);
        document.addEventListener('visibilitychange', updateStandalone);

        setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent));

        // Gate reads on mount (and on visibilitychange for returning tabs).
        const checkGates = () => {
            setDismissedRecently(Date.now() - readDismissedAt(DISMISS_KEY) < COOLDOWN_MS);
            setLandingDismissedRecently(
                Date.now() - readDismissedAt(LANDING_DISMISS_KEY) < LANDING_COOLDOWN_MS,
            );
            setHasSeenAppBefore(
                hasAnyKey([SEEN_APP_BEFORE_KEY, ...LEGACY_EVIDENCE_KEYS]),
            );
        };
        checkGates();
        document.addEventListener('visibilitychange', checkGates);

        // Chromium fires beforeinstallprompt once per load when installable.
        const onBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

        // App was installed — the browser fires appinstalled once. Reset the
        // welcome flag so the FIRST standalone launch after install shows the
        // checkpoint exactly once (Gate 3 §1), refresh the returning-user
        // gate against fresh storage, then track the funnel event.
        const onAppInstalled = () => {
            setDeferredPrompt(null);
            try {
                window.localStorage.removeItem(WELCOME_SEEN_KEY);
            } catch {
                // storage unavailable — welcome may re-show once; acceptable
            }
            setWelcomeCleared(true); // re-open the welcome gate THIS session
            setHasSeenAppBefore(hasAnyKey([SEEN_APP_BEFORE_KEY, ...LEGACY_EVIDENCE_KEYS]));
            trackEvent('pwa_install_accepted', { platform: 'browser_event' });
        };
        window.addEventListener('appinstalled', onAppInstalled);

        return () => {
            mq.removeEventListener('change', updateStandalone);
            window.removeEventListener('focus', updateStandalone);
            document.removeEventListener('visibilitychange', updateStandalone);
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
            window.removeEventListener('appinstalled', onAppInstalled);
        };
    }, []);

    const canInstall = deferredPrompt !== null;

    const shouldShowBanner =
        !isStandalone && !dismissedRecently && (canInstall || isIos);

    // ─── Install-landing gate (Gate 3 §2): standalone NEVER sees the landing;
    // dismissed-within-30-days visitors go straight to the app; every other
    // browser visitor gets the landing (the CTA adapts per platform, §3).
    const shouldShowLanding = !isStandalone && !landingDismissedRecently;

    // ─── Welcome checkpoint gate (Gate 3 §1.2): standalone + welcome never
    // seen + not a returning app user. markWelcomeSeen()/markAppSeen() flip
    // these; the 10s safety-net timer in WelcomeCheckpoint calls markAppSeen.
    // welcomeCleared: appinstalled removed the stored flag this session (see
    // state decl above) — must participate in the gate or the flip is a no-op.
    const shouldShowWelcome =
        isStandalone &&
        (welcomeCleared || readDismissedAt(WELCOME_SEEN_KEY) === 0) &&
        !hasSeenAppBefore;

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
        writeKey(DISMISS_KEY);
        setDismissedRecently(true);
        trackEvent('pwa_install_dismissed', {
            platform: isIos && !canInstall ? 'ios_safari' : 'desktop_chromium',
        });
    }, [canInstall, isIos]);

    const dismissLanding = useCallback(() => {
        writeKey(LANDING_DISMISS_KEY);
        setLandingDismissedRecently(true);
        trackEvent('pwa_install_dismissed', {
            surface: 'landing',
            platform: isIos && !canInstall ? 'ios_safari' : 'desktop_chromium',
        });
    }, [canInstall, isIos]);

    /** Welcome CTA: writes BOTH gates in one call (Gate 3 §1.2). */
    const markWelcomeSeen = useCallback(() => {
        writeKey(WELCOME_SEEN_KEY);
        writeKey(SEEN_APP_BEFORE_KEY);
        setHasSeenAppBefore(true);
    }, []);

    /** 10s safety net: user closed the app before tapping the CTA — they've
     *  seen the checkpoint, don't nag on the next launch. */
    const markAppSeen = useCallback(() => {
        writeKey(SEEN_APP_BEFORE_KEY);
        setHasSeenAppBefore(true);
    }, []);

    return {
        canInstall,
        isStandalone,
        isIos,
        shouldShowBanner,
        shouldShowLanding,
        shouldShowWelcome,
        promptInstall,
        dismiss,
        dismissLanding,
        markWelcomeSeen,
        markAppSeen,
    };
}
