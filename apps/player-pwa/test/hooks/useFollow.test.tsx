import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFollow, type FollowState } from '@/hooks/useFollow';

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    queryClient,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const initialProfile = { isFollowing: false, followersCount: 10, followingCount: 5 };

describe('useFollow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically flips follow state and bumps the follower count', async () => {
    mockFetcher.mockResolvedValue(initialProfile);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFollow('target1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const d = deferred<FollowState>();
    mockFetcher.mockReturnValue(d.promise);

    act(() => {
      result.current.follow();
    });

    await waitFor(() => {
      expect(result.current.isFollowing).toBe(true);
      expect(result.current.followersCount).toBe(11);
    });

    await act(async () => {
      d.resolve({ following: true, followersCount: 11, followingCount: 5 });
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
  });

  it('rolls back the optimistic follow on failure', async () => {
    mockFetcher.mockResolvedValue(initialProfile);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFollow('target1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const d = deferred<FollowState>();
    mockFetcher.mockReturnValue(d.promise);

    act(() => {
      result.current.follow();
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(true));

    await act(async () => {
      d.reject(new Error('Network error'));
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
    expect(result.current.followersCount).toBe(10);
  });

  it('optimistically flips off and decrements on unfollow', async () => {
    mockFetcher.mockResolvedValue({ isFollowing: true, followersCount: 10, followingCount: 5 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useFollow('target1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const d = deferred<FollowState>();
    mockFetcher.mockReturnValue(d.promise);

    act(() => {
      result.current.unfollow();
    });

    await waitFor(() => {
      expect(result.current.isFollowing).toBe(false);
      expect(result.current.followersCount).toBe(9);
    });

    await act(async () => {
      d.resolve({ following: false, followersCount: 9, followingCount: 5 });
    });
    await waitFor(() => expect(result.current.isFollowing).toBe(false));
  });
});
