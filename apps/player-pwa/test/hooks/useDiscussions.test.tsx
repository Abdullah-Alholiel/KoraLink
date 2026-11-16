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

import { useDiscussions } from '@/hooks/useMessages';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function makeApiDiscussion(id: string) {
  return {
    id,
    type: 'match' as const,
    title: `Match ${id}`,
    lastMessage: 'hi',
    lastMessageAt: '2026-09-30T18:00:00.000Z',
    lastMessageSenderName: 'Ahmed',
    unreadCount: 0,
  };
}

const PAGE_1 = '/users/me/discussions?page=1&perPage=30';
const PAGE_2 = '/users/me/discussions?page=2&perPage=30';

describe('useDiscussions (messages list freshness poll)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetcher.mockImplementation((url: string) =>
      Promise.resolve(
        url === PAGE_1
          ? { discussions: [makeApiDiscussion('d1'), makeApiDiscussion('d2')], total: 3, hasMore: true }
          : { discussions: [makeApiDiscussion('d3')], total: 3, hasMore: false },
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flattens loaded pages into one discussion list', async () => {
    const { result } = renderHook(() => useDiscussions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.discussions).toHaveLength(2));
    expect(result.current.discussions.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(result.current.total).toBe(3);
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.discussions).toHaveLength(3));
    expect(result.current.discussions[2].id).toBe('d3');
  });

  it('refetches page 1 after 45s while on the first page', async () => {
    const { result } = renderHook(() => useDiscussions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.discussions).toHaveLength(2));
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    await waitFor(() => expect(mockFetcher).toHaveBeenCalledTimes(2));
    expect(mockFetcher).toHaveBeenNthCalledWith(2, PAGE_1);
  });

  it('does NOT poll once paged deeper (F4 fan-out guard)', async () => {
    const { result } = renderHook(() => useDiscussions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.discussions).toHaveLength(2));

    act(() => {
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.discussions).toHaveLength(3));
    expect(mockFetcher).toHaveBeenLastCalledWith(PAGE_2);
    const callsAfterPaging = mockFetcher.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000 * 2);
    });
    expect(mockFetcher).toHaveBeenCalledTimes(callsAfterPaging);
  });
});
