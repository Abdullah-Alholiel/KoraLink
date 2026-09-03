'use client';

import { useEffect } from 'react';

/**
 * ViewportHeightSync — iOS standalone (installed PWA) bottom-gap fix.
 *
 * Root cause (Abdullah, 2026-09-03): with `viewportFit: cover` +
 * `black-translucent`, the app draws edge-to-edge — but in standalone mode
 * iOS WebKit misreports dynamic viewport units: `100dvh`/`100vh` resolve to
 * the SMALL viewport height (excluding the home-indicator safe area), so the
 * fixed shell (`body { height: var(--app-height) }`) ends ~30px short and a
 * dead white strip shows below BottomNav. Browser tabs (desktop + mobile
 * web) are unaffected — there `dvh` tracks the real visible viewport, so the
 * CSS default stays.
 *
 * Fix: in standalone ONLY, pin `--app-height` to `window.innerHeight` — the
 * one value iOS reports truthfully in standalone — and re-sync on resize /
 * orientation / visibility / visualViewport changes (rotation, keyboard via
 * `interactiveWidget: resizes-content`).
 */
export default function ViewportHeightSync() {
    useEffect(() => {
        const isStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true;
        if (!isStandalone) return;

        const set = () => {
            document.documentElement.style.setProperty(
                '--app-height',
                `${window.innerHeight}px`
            );
        };
        set();
        window.addEventListener('resize', set);
        window.addEventListener('orientationchange', set);
        document.addEventListener('visibilitychange', set);
        window.visualViewport?.addEventListener('resize', set);
        return () => {
            window.removeEventListener('resize', set);
            window.removeEventListener('orientationchange', set);
            document.removeEventListener('visibilitychange', set);
            window.visualViewport?.removeEventListener('resize', set);
        };
    }, []);

    return null;
}
