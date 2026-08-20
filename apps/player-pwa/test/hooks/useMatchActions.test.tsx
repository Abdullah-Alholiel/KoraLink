import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { Match } from '@/types';
import {
  optimisticallyJoin,
  optimisticallyLeave,
  useJoinMatch,
  useLeaveMatch,
} from '@/hooks/useMatchActions';
import { useAppStore } from '@/store/useAppStore';

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

const testUser = {
  id: 'u1',
  fullName: 'Test User',
  handle: 'testuser',
  avatarUrl: '',
  phone: '+966500000000',
  preferredLocation: '',
  preferredPosition: '',
  skillLevel: 'intermediate' as const,
  locale: 'en' as const,
};

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

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    title: 'Test Match',
    hostId: 'h1',
    organizer: { name: 'Host', handle: '', avatarUrl: '' },
    date: '2026-08-10',
    time: '18:00',
    location: 'Riyadh',
    venueName: 'Venue A',
    format: '7v7',
    surface: 'Grass',
    gender: 'men',
    intensity: 'Casual',
    price: 37,
    currency: 'SAR',
    totalSpots: 10,
    filledSpots: 5,
    status: 'open',
    roster: [],
    comments: [],
    isJoined: false,
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

describe('optimisticallyJoin', () => {
  it('flips isJoined, bumps filledSpots, and appends the roster entry', () => {
    const result = optimisticallyJoin(makeMatch(), { id: 'u1', fullName: 'Test User', avatarUrl: '' });
    expect(result.isJoined).toBe(true);
    expect(result.filledSpots).toBe(6);
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0].userId).toBe('u1');
    expect(result.roster[0].name).toBe('Test User');
  });

  it('does not double-count when the actor is already in the roster', () => {
    const match = makeMatch({
      filledSpots: 5,
      roster: [{ id: 'u1', userId: 'u1', name: 'Test User', avatarUrl: '', team: null, isHost: false, noShow: false }],
    });
    const result = optimisticallyJoin(match, { id: 'u1', fullName: 'Test User', avatarUrl: '' });
    expect(result.filledSpots).toBe(5);
    expect(result.roster).toHaveLength(1);
  });

  it('flips open → full when the last spot is filled', () => {
    const result = optimisticallyJoin(makeMatch({ filledSpots: 9, totalSpots: 10 }), {
      id: 'u1',
      fullName: 'Test User',
      avatarUrl: '',
    });
    expect(result.status).toBe('full');
  });
});

describe('optimisticallyLeave', () => {
  it('flips isJoined, decrements spots, and removes the roster entry', () => {
    const match = makeMatch({
      isJoined: true,
      filledSpots: 6,
      roster: [{ id: 'u1', userId: 'u1', name: 'Test User', avatarUrl: '', team: null, isHost: false, noShow: false }],
    });
    const result = optimisticallyLeave(match, 'u1');
    expect(result.isJoined).toBe(false);
    expect(result.filledSpots).toBe(5);
    expect(result.roster).toHaveLength(0);
  });

  it('flips full → open when leaving a full match', () => {
    const match = makeMatch({
      isJoined: true,
      status: 'full',
      filledSpots: 10,
      totalSpots: 10,
      roster: [{ id: 'u1', userId: 'u1', name: 'Test User', avatarUrl: '', team: null, isHost: false, noShow: false }],
    });
    const result = optimisticallyLeave(match, 'u1');
    expect(result.status).toBe('open');
  });
});

describe('useJoinMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ user: testUser });
  });

  it('optimistically updates the match detail cache, then reconciles on success', async () => {
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['match', 'm1', { currentUserId: 'u1' }], makeMatch());

    const d = deferred<unknown>();
    mockFetcher.mockReturnValue(d.promise);

    const { result } = renderHook(() => useJoinMatch(), { wrapper });
    act(() => {
      result.current.mutate('m1');
    });

    // Optimistic state is visible while the request is still in flight.
    await waitFor(() => {
      const cached = queryClient.getQueryData<Match>(['match', 'm1', { currentUserId: 'u1' }]);
      expect(cached?.isJoined).toBe(true);
      expect(cached?.filledSpots).toBe(6);
    });

    await act(async () => {
      d.resolve({});
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the optimistic update when join fails', async () => {
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['match', 'm1', { currentUserId: 'u1' }], makeMatch());

    const d = deferred<unknown>();
    mockFetcher.mockReturnValue(d.promise);

    const { result } = renderHook(() => useJoinMatch(), { wrapper });
    act(() => {
      result.current.mutate('m1');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<Match>(['match', 'm1', { currentUserId: 'u1' }])?.isJoined).toBe(true);
    });

    await act(async () => {
      d.reject(new Error('Match is full'));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<Match>(['match', 'm1', { currentUserId: 'u1' }]);
    expect(cached?.isJoined).toBe(false);
    expect(cached?.filledSpots).toBe(5);
    expect(cached?.roster).toHaveLength(0);
  });
});

describe('useLeaveMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ user: testUser });
  });

  it('optimistically removes the user from the cached match', async () => {
    const { wrapper, queryClient } = createWrapper();
    const joined = makeMatch({
      isJoined: true,
      filledSpots: 6,
      roster: [{ id: 'u1', userId: 'u1', name: 'Test User', avatarUrl: '', team: null, isHost: false, noShow: false }],
    });
    queryClient.setQueryData(['match', 'm1', { currentUserId: 'u1' }], joined);

    const d = deferred<unknown>();
    mockFetcher.mockReturnValue(d.promise);

    const { result } = renderHook(() => useLeaveMatch(), { wrapper });
    act(() => {
      result.current.mutate('m1');
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Match>(['match', 'm1', { currentUserId: 'u1' }]);
      expect(cached?.isJoined).toBe(false);
      expect(cached?.filledSpots).toBe(5);
    });

    await act(async () => {
      d.resolve({});
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
