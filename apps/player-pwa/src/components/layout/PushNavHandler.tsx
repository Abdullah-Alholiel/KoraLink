'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * P2-93 (run #70): page side of the worker's guarded notification tap.
 *
 * The service worker no longer hard-navigates an existing window —
 * `client.navigate()` wiped the app's in-memory state (Zustand store,
 * React Query cache, chat drafts, scroll position) even when the window was
 * ALREADY on the target route. Instead the worker focuses the window and
 * posts `{ type: 'kl-push-nav', url }`; THIS hook performs the soft
 * `router.push()` so the App Router shared layout survives and only the
 * routed content swaps.
 *
 * Validation happens twice: the worker resolves + normalises first
 * (cross-origin/unparseable URLs are swallowed there), and this listener
 * re-validates in-app paths only — defense-in-depth, because the
 * `message` channel on navigator.serviceWorker is not worker-exclusive.
 */
export function usePushNav() {
  const router = useRouter();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (!data || data.type !== 'kl-push-nav') return;
      if (typeof data.url !== 'string' || !data.url.startsWith('/')) return;
      router.push(data.url);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [router]);
}

/** Layout-mounted no-op renderer; all behavior lives in {@link usePushNav}. */
export default function PushNavHandler() {
  usePushNav();
  return null;
}
