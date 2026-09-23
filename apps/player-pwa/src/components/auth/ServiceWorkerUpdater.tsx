'use client';

import { useEffect } from 'react';
import { captureError } from '@/providers/ObservabilityProvider';

/**
 * Reloads the page when a NEW service worker takes control, so a redeploy
 * never leaves a stale SW serving since-deleted chunk references — which
 * surfaces as `ChunkLoadError: Loading chunk N failed`.
 *
 * With `skipWaiting: true` + `clientsClaim`, the SW can activate and take
 * control of the page *before* React mounts this component, so a naive
 * `controllerchange` listener misses the transition entirely. We therefore:
 *   1. register `controllerchange` → reload (catches mid-session activation), and
 *   2. call `registration.update()` on mount and watch `updatefound`, which
 *      deterministically re-detects a new SW on every load and activates it.
 *
 * Both paths collapse into a single `reloadOnce`, so the page reloads at most
 * once per lifecycle.
 *
 * P2-60 (run #50): this component ALSO owns the `/sw.js` registration call —
 * next-pwa's injected `register: true` script lets failures escape as
 * UNHANDLED promise rejections (Sentry KORALINK-WEB-2: old browsers and
 * enterprise CSPs blocking the worker). Here a failed registration is
 * captured with scope `swRegister` and the page silently degrades to
 * no-offline support instead of erroring.
 */
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    // P2-60 (run #50): truthiness guard (not `in`) — also covers environments
    // where the property exists but is undefined.
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    let reloading = false;
    const reloadOnce = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);

    // Registration with an explicit failure path (P2-60). Update detection
    // below still rides `navigator.serviceWorker.ready`, so this only needs
    // the catch — never an unhandled rejection.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => captureError(err, { scope: 'swRegister' }));

    navigator.serviceWorker.ready
      .then((reg) => {
        // A new worker may already be waiting — tell it to activate.
        if (reg?.waiting) reg?.waiting.postMessage({ type: 'SKIP_WAITING' });

        // Re-run the update check now that our controllerchange listener is
        // definitely registered, and watch for a freshly-installed worker.
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        reg.update().catch(() => {});
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', reloadOnce);
    };
  }, []);

  return null;
}
