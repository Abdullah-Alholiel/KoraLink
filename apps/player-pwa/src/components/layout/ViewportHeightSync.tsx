'use client';

import { useEffect } from 'react';
import { captureError } from '@/providers/ObservabilityProvider';

/**
 * ViewportHeightSync v2 — iOS standalone (installed PWA) bottom-gap fix.
 *
 * Symptom (Abdullah, 2026-09-03, persisted across delete+reinstall): a dead
 * strip below BottomNav in the INSTALLED app only — never in browser/desktop.
 *
 * Root cause: with `viewportFit: cover` + `black-translucent` the app draws
 * edge-to-edge, but iOS WebKit standalone misreports dynamic viewport units —
 * `100dvh`/`100vh` resolve SMALLER than the physical screen (safe areas are
 * treated as dynamic chrome). The fixed shell (body height: var(--app-height))
 * ends short and the body background shows below the nav.
 *
 * v1 pinned window.innerHeight — insufficient: innerHeight can be reported
 * short in standalone too (same safe-area accounting). v2 pins the PHYSICAL
 * screen height: the max of every viewport measure the platform offers
 * (screen.height/width — width guards the landscape-report quirk — availHeight,
 * visualViewport.height, innerHeight, documentElement.clientHeight). All sane
 * browsers agree on at least one truth here; iOS standalone's largest number
 * is the physical height. Web mode is untouched (dvh default is correct and
 * drives keyboard/toolbar tracking).
 *
 * Also emits a ONE-SHOT per-session Sentry diagnostic with the raw viewport
 * numbers, so device ground truth lands in Sentry even if this heuristic ever
 * misses on some future iOS build.
 */
export default function ViewportHeightSync() {
    useEffect(() => {
        const nav = navigator as Navigator & { standalone?: boolean };
        const mq = window.matchMedia('(display-mode: standalone)');
        const isStandalone = () => mq.matches || nav.standalone === true;
        if (!isStandalone()) return;

        const apply = (reason: string) => {
            const vv = window.visualViewport;
            const candidates = [
                window.screen?.height,
                window.screen?.width, // orientation quirk: iOS may report the long edge here
                window.screen?.availHeight,
                window.screen?.availWidth,
                vv?.height,
                window.innerHeight,
                document.documentElement.clientHeight,
            ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
            const physical = Math.round(Math.max(...candidates));
            if (physical <= 0) return;
            document.documentElement.style.setProperty('--app-height', `${physical}px`);

            // One-shot diagnostic per session — device ground truth to Sentry.
            try {
                if (!sessionStorage.getItem('koralink_vh_diag')) {
                    sessionStorage.setItem('koralink_vh_diag', '1');
                    captureError(new Error('viewport-diagnostic:standalone'), {
                        reason,
                        inner: window.innerHeight,
                        client: document.documentElement.clientHeight,
                        vvHeight: vv?.height ?? null,
                        vvOffsetTop: vv?.offsetTop ?? null,
                        vvScale: vv?.scale ?? null,
                        screenH: window.screen?.height ?? null,
                        screenW: window.screen?.width ?? null,
                        availH: window.screen?.availHeight ?? null,
                        dpr: window.devicePixelRatio,
                        pinned: physical,
                        dvhSupport: window.CSS?.supports?.('height', '100dvh') ?? null,
                    });
                }
            } catch {
                // storage unavailable (private mode) — diagnostic is best-effort
            }
        };

        const onResize = () => apply('resize');
        const onOrientation = () => apply('orientationchange');
        const onVisibility = () => {
            if (document.visibilityState === 'visible') apply('visibility');
        };
        const onVvResize = () => apply('vv-resize');
        const onDmChange = () => {
            if (isStandalone()) apply('dm-change');
        };

        apply('mount');
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onOrientation);
        document.addEventListener('visibilitychange', onVisibility);
        window.visualViewport?.addEventListener('resize', onVvResize);
        mq.addEventListener?.('change', onDmChange);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onOrientation);
            document.removeEventListener('visibilitychange', onVisibility);
            window.visualViewport?.removeEventListener('resize', onVvResize);
            mq.removeEventListener?.('change', onDmChange);
        };
    }, []);

    return null;
}
