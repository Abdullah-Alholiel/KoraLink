'use client';

import { useEffect } from 'react';

const RELOADED_KEY = 'koralink:chunk-reload-attempted';

/**
 * Recovers from `ChunkLoadError: Loading chunk N failed`.
 *
 * Happens when the browser holds a stale HTML shell (or service-worker
 * precache) that references since-deleted chunk hashes after a redeploy. The
 * webpack runtime rejects the lazy `import()` and surfaces it as an unhandled
 * promise rejection — which React error boundaries do NOT catch.
 *
 * On the first chunk error in a tab session we hard-reload once: the fresh
 * document references the current chunk hashes, so the app self-heals. A
 * `sessionStorage` flag prevents an infinite reload loop if the server is still
 * mid-deploy (the flag clears when the tab closes).
 */
export default function ChunkLoadErrorHandler() {
  useEffect(() => {
    const isChunkError = (reason: unknown): boolean => {
      if (!reason || typeof reason !== 'object') return false;
      const err = reason as { name?: string; message?: string };
      if (err.name === 'ChunkLoadError') return true;
      const msg = err.message ?? '';
      return msg.includes('Loading chunk') || msg.includes('Loading CSS chunk');
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkError(event.reason)) return;
      try {
        if (sessionStorage.getItem(RELOADED_KEY)) return;
        sessionStorage.setItem(RELOADED_KEY, '1');
      } catch {
        // sessionStorage unavailable (private mode / storage disabled) — still
        // reload once; the effect cleanup prevents a hard loop on remount.
      }
      window.location.reload();
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  return null;
}
