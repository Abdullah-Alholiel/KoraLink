'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { attachCachePersistence } from '@/lib/query-persister';
import { FetchError } from '@/lib/fetcher';

/** Exported for tests (test/providers/query-retry.test.ts). */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 1-minute stale time prevents redundant API calls between tab switches
        staleTime: 60 * 1000,
        // Don't re-fetch on window focus – avoids hammering the backend
        refetchOnWindowFocus: false,
        // Retry transient failures (network, 5xx) once — but NEVER retry
        // deterministic 4xx rejections (401/403/404/409 …): the answer cannot
        // change, so retrying only multiplies console noise and backend load
        // (403 chat 403 ×4 in prod console, 2026-09-09). AuthBootstrap opts out
        // of retrying entirely with its own `retry: false`.
        retry: (failureCount, error) => {
          if (error instanceof FetchError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 1;
        },
      },
    },
  });
}

// Singleton for the browser; fresh instance per SSR request
let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  // Use useState so the client is not recreated on every render
  const [queryClient] = useState(() => getQueryClient());

  // Persisted query cache (P2-45): restores the last snapshot from IndexedDB
  // on cold open, then keeps the snapshot fresh (throttled writes). Children
  // are NOT gated on restore — if IndexedDB is slow, unavailable, or corrupt,
  // the app renders exactly as it did pre-P2-45 (plain network fetch), never
  // blank. Restored queries still revalidate per their own staleTime.
  useEffect(() => attachCachePersistence(queryClient), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
