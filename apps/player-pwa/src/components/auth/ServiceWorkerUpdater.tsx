'use client';

import { useEffect } from 'react';

/**
 * Reloads the page once when the service worker is updated, so a redeploy
 * never leaves a stale SW serving old (since-deleted) chunk references —
 * which surfaces as `ChunkLoadError: Loading chunk N failed`.
 *
 * Guarded to only fire on UPDATE (a controller already existed), not on the
 * first install, and to reload at most once.
 */
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;

    const onControllerChange = () => {
      if (reloading) return;
      if (!hadController) return; // first install — nothing stale to clear
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
