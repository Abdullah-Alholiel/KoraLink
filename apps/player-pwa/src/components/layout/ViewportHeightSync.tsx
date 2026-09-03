'use client';

import { useEffect } from 'react';
import { captureError } from '@/providers/ObservabilityProvider';

/**
 * ViewportHeightSync v3 — iOS standalone (installed PWA) bottom-gap fix.
 *
 * Device ground truth (Abdullah's iPhone, iOS 18.7, 428×926pt, Sentry
 * 'viewport-diagnostic:standalone' event 05ee0962): in standalone the VISIBLE
 * web canvas is 879pt top-anchored; the bottom 47pt (home-indicator zone) is
 * OUTSIDE the canvas and painted by iOS itself (launch underlay). Web code
 * cannot render there — ever.
 *
 * Therefore: pin --app-height to the VISIBLE CANVAS = max(innerHeight,
 * clientHeight, visualViewport.height) — the measures that agree on the true
 * paintable area. NEVER screen.height/availHeight (v2 pinned 926 and pushed
 * BottomNav's labels into the unpaintable zone → clipped labels, hidden Play
 * label). With canvas-correct height the nav is fully visible and the system
 * zone merges with the nav's white background (native Settings-app look).
 *
 * Edge-to-edge (no strip at all) requires the viewport-fit:cover meta to be
 * honored — which iOS does reliably only on SECURE origins. On the insecure
 * http://IP bookmark iOS caps the canvas short; re-adding the bookmark from
 * the HTTPS origin restores the full canvas. The Sentry diagnostic
 * ('viewport-diagnostic:standalone') keeps capturing per-device numbers to
 * verify that.
 */
export default function ViewportHeightSync() {
    useEffect(() => {
        const nav = navigator as Navigator & { standalone?: boolean };
        const mq = window.matchMedia('(display-mode: standalone)');
        const isStandalone = () => mq.matches || nav.standalone === true;
        if (!isStandalone()) return;

        const apply = (reason: string) => {
            const vv = window.visualViewport;
            // Visible (paintable) canvas — NOT screen.height (v2 lesson: the
            // home-indicator zone is unpaintable; nav labels got buried there).
            const candidates = [
                window.innerHeight,
                document.documentElement.clientHeight,
                vv?.height,
            ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
            const canvas = Math.round(Math.max(...candidates));
            if (canvas <= 0) return;
            document.documentElement.style.setProperty('--app-height', `${canvas}px`);

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
                        pinned: canvas,
                        canvasVsScreenDelta: (window.screen?.height ?? canvas) - canvas,
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
