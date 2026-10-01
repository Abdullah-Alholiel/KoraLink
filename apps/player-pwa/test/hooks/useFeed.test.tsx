import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
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

import { useFeed } from '@/hooks/useFeed';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function makeApiFeedItem(id: string) {
  return {
    id,
    verb: 'joined_match',
    actor: { id: `u-${id}`, name: 'Ahmed', handle: null, avatarUrl: null },
    match: { id: `m-${id}`, title: `Match ${id}`, venueName: null, scheduledAt: null },
    subjectUserId: null,
    isRead: false,
    createdAt: '2026-10-01T09:00:00.000Z',
  };
}

describe('useFeed (home activity freshness poll, P2-135)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetcher.mockImplementation(() =>
      Promise.resolve({ items: [makeApiFeedItem('f1')], total: 1, hasMore: false }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches the feed, then refetches on the 45s freshness poll', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(mockFetcher).toHaveBeenCalledWith('/users/me/feed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    await waitFor(() => expect(mockFetcher).toHaveBeenCalledTimes(2));
    expect(mockFetcher).toHaveBeenLastCalledWith('/users/me/feed');
  });

  it('does not stack a poll behind an in-flight fetch', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    // Simulate a slow in-flight refetch: resolve it only after the poll window.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockFetcher.mockImplementation(() => gate.then(() => Promise.resolve({ items: [], total: 0, hasMore: false })));

    void result.current.refetch();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000 * 2);
    });
    // Only the manual refetch call — no interval refetch stacked behind it.
    expect(mockFetcher).toHaveBeenCalledTimes(2);
    release();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
