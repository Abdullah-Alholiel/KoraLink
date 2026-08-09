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

// Mock socket.io-client for useMessages
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

import { useVenues, useVenue } from '@/hooks/useVenues';
import { useUserProfile, useUserStats, useUpdateProfile } from '@/hooks/useUser';
import { useMyMatches, useMatchChat } from '@/hooks/useMessages';

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

describe('useVenues hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches nearby venues from /venues', async () => {
    const mockVenues = [
      { id: 'v1', name: 'Kora Park', city: 'Riyadh', rating: 4.9, pitch_count: 3 },
    ];
    mockFetcher.mockResolvedValue(mockVenues);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useVenues(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetcher).toHaveBeenCalledWith('/venues', expect.objectContaining({}));
    expect(result.current.data).toEqual(mockVenues);
  });

  it('passes city filter as query param', async () => {
    mockFetcher.mockResolvedValue([]);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useVenues({ city: 'Jeddah' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetcher).toHaveBeenCalledWith('/venues', {
      params: { city: 'Jeddah' },
    });
  });

  it('handles error state', async () => {
    mockFetcher.mockRejectedValue(new Error('Network error'));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useVenues(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('useVenue fetches a single venue by id', async () => {
    const mockVenue = { id: 'v1', name: 'Kora Park', owner: {}, pitches: [] };
    mockFetcher.mockResolvedValue(mockVenue);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useVenue('v1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetcher).toHaveBeenCalledWith('/venues/v1');
  });
});

describe('useUser hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useUserProfile fetches /users/me', async () => {
    const mockProfile = { id: 'u1', full_name: 'Ahmed', phone: '+966500000000' };
    mockFetcher.mockResolvedValue(mockProfile);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUserProfile(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetcher).toHaveBeenCalledWith('/users/me');
    expect(result.current.data).toEqual(mockProfile);
  });

  it('useUserStats fetches /users/me/stats', async () => {
    const mockStats = { games_played: 12, rating: 4.5, karma_score: 20, no_show_count: 0 };
    mockFetcher.mockResolvedValue(mockStats);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUserStats(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetcher).toHaveBeenCalledWith('/users/me/stats');
    expect(result.current.data).toEqual(mockStats);
  });

  it('useUpdateProfile sends PATCH /users/me with partial payload', async () => {
    const updated = { id: 'u1', full_name: 'New Name' };
    mockFetcher.mockResolvedValue(updated);

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    await waitFor(() => {
      result.current.mutate({ full_name: 'New Name' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetcher).toHaveBeenCalledWith('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ full_name: 'New Name' }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user', 'me'] });
  });
});

describe('useMessages hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useMyMatches fetches joined matches from /users/me/matches', async () => {
    const mockMatches = [
      { id: 'm1', title: 'Night Owl', status: 'Open', spots_filled: 8, max_players: 14 },
    ];
    mockFetcher.mockResolvedValue(mockMatches);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMyMatches(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetcher).toHaveBeenCalledWith('/users/me/matches');
    expect(result.current.data).toEqual(mockMatches);
  });

  it('useMatchChat fetches history from /matches/:id/messages', async () => {
    const mockMessages = [
      { id: 'msg1', match_id: 'm1', content: 'Hello', user: { full_name: 'Ahmed' } },
    ];
    mockFetcher.mockResolvedValue(mockMessages);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetcher).toHaveBeenCalledWith('/matches/m1/messages');
    expect(result.current.messages).toEqual(mockMessages);
  });

  it('useMatchChat does not fetch when matchId is null', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMatchChat(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetcher).not.toHaveBeenCalled();
  });
});
