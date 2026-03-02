'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 1-minute stale time prevents redundant API calls between tab switches
        staleTime: 60 * 1000,
        // Don't re-fetch on window focus – avoids hammering the backend
        refetchOnWindowFocus: false,
        // Retry once on failure before surfacing the error
        retry: 1,
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

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
