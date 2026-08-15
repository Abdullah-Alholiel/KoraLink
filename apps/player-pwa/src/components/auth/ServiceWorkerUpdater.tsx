'use client';

import { useEffect } from 'react';

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
 */
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let reloading = false;
    const reloadOnce = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);

    navigator.serviceWorker.ready
      .then((reg) => {
        // A new worker may already be waiting — tell it to activate.
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });

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
