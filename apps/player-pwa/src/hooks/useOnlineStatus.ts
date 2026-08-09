'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks browser online/offline status via `navigator.onLine`
 * and `online`/`offline` events.
 *
 * Always defaults to `true` during SSR to avoid hydration mismatches —
 * the real value is set on the client in a `useEffect`.
 *
 * Used by pages to show the offline banner when the network is unavailable.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial value on mount (client-only)
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
