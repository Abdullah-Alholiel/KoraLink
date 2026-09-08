'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe online/offline tracker.
 *
 * Initial state is `true` on BOTH server and client (hydration-safe — the
 * server never knows the browser's connectivity), then synchronized to the
 * real navigator.onLine value inside useEffect, and kept in sync via the
 * online/offline window events.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
