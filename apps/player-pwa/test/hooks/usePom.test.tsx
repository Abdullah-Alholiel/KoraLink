import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { optimisticallyCastVote, useVote, type PomResult } from '@/hooks/usePom';

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

function makeVotingOpen(overrides: Partial<Extract<PomResult, { status: 'voting_open' }>> = {}) {
  return {
    status: 'voting_open' as const,
    completedAt: '2026-08-10T20:00:00.000Z',
    votingClosesAt: '2026-08-11T20:00:00.000Z',
    hasVoted: false,
    votedFor: null,
    totalEligibleVoters: 10,
    votedCount: 3,
    candidates: [],
    ...overrides,
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

describe('optimisticallyCastVote', () => {
  it('flips hasVoted, records votedFor, and increments the count on a first vote', () => {
    const result = optimisticallyCastVote(makeVotingOpen(), 'c1') as Extract<
      PomResult,
      { status: 'voting_open' }
    >;
    expect(result.status).toBe('voting_open');
    expect(result.hasVoted).toBe(true);
    expect(result.votedFor).toBe('c1');
    expect(result.votedCount).toBe(4);
  });

  it('keeps the count when changing an existing vote', () => {
    const result = optimisticallyCastVote(
      makeVotingOpen({ hasVoted: true, votedFor: 'c1', votedCount: 4 }),
      'c2',
    ) as Extract<PomResult, { status: 'voting_open' }>;
    expect(result.votedFor).toBe('c2');
    expect(result.votedCount).toBe(4);
  });

  it('passes through non-voting_open states untouched', () => {
    const completed = { status: 'completed' as const, winner: { id: 'w1', fullName: 'W', avatarUrl: null }, voteCount: 3, results: [] };
    expect(optimisticallyCastVote(completed, 'c1')).toEqual(completed);
  });
});

describe('useVote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically casts the vote in the pom cache and rolls back on failure', async () => {
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['pom', 'm1', { currentUserId: 'u1' }], makeVotingOpen());

    const d = deferred<unknown>();
    mockFetcher.mockReturnValue(d.promise);

    const { result } = renderHook(() => useVote('m1'), { wrapper });
    act(() => {
      result.current.mutate('c1');
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<PomResult>(['pom', 'm1', { currentUserId: 'u1' }]);
      expect(cached?.status).toBe('voting_open');
      if (cached?.status === 'voting_open') {
        expect(cached.hasVoted).toBe(true);
        expect(cached.votedFor).toBe('c1');
        expect(cached.votedCount).toBe(4);
      }
    });

    await act(async () => {
      d.reject(new Error('Voting closed'));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<PomResult>(['pom', 'm1', { currentUserId: 'u1' }]);
    if (cached?.status === 'voting_open') {
      expect(cached.hasVoted).toBe(false);
      expect(cached.votedFor).toBeNull();
      expect(cached.votedCount).toBe(3);
    }
  });
});
