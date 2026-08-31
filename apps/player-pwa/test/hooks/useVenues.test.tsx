import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock fetcher
const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  FetchError: class FetchError extends Error {
    status: number;
    url: string;
    constructor(msg: string, status: number, url: string) {
      super(msg);
      this.name = 'FetchError';
      this.status = status;
      this.url = url;
    }
  },
}));

import { useVenues } from '@/hooks/useVenues';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    queryClient,
  };
}

describe('useVenues (P1-28 server-side search)', () => {
  beforeEach(() => {
    mockFetcher.mockReset();
    mockFetcher.mockResolvedValue([]);
  });

  it('sends search as a query param when provided', async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useVenues({ search: 'Kings' }), { wrapper });

    await waitFor(() => expect(mockFetcher).toHaveBeenCalled());

    const [url, opts] = mockFetcher.mock.calls[0] as [string, { params?: Record<string, string> }];
    expect(url).toBe('/venues');
    expect(opts?.params).toEqual({ search: 'Kings' });
  });

  it('omits the search param when absent (legacy shape preserved)', async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useVenues({ lat: 24.7, lng: 46.7 }), { wrapper });

    await waitFor(() => expect(mockFetcher).toHaveBeenCalled());

    const [, opts] = mockFetcher.mock.calls[0] as [string, { params?: Record<string, string> }];
    expect(opts?.params).toEqual({ lat: '24.7', lng: '46.7' });
    expect(opts?.params?.search).toBeUndefined();
  });

  it('varies the query key by search — typing a new term refetches', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { rerender } = renderHook(({ search }: { search?: string }) => useVenues({ search }), {
      wrapper,
      initialProps: { search: undefined as string | undefined },
    });

    await waitFor(() => expect(mockFetcher).toHaveBeenCalledTimes(1));

    rerender({ search: 'Olaya' });
    await waitFor(() => expect(mockFetcher).toHaveBeenCalledTimes(2));

    const calls = mockFetcher.mock.calls.map((c) => (c[1] as { params?: Record<string, string> })?.params);
    expect(calls[0]).toBeUndefined();
    expect(calls[1]).toEqual({ search: 'Olaya' });
    expect(queryClient.getQueryData(['venues', { search: 'Olaya' }])).toEqual([]);
  });
});
