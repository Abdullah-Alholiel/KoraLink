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

import { useMatches, useMatch, useCreateMatch } from '@/hooks/useMatches';

// Wrapper with QueryClientProvider
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

// Helper: build a minimal API-shaped nearby match row
function makeApiMatch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm1',
    title: 'Test Match',
    match_type: 'Casual',
    gender_rule: 'Men Only',
    status: 'Open',
    scheduled_at: '2026-08-10T18:00:00.000Z',
    duration_mins: 60,
    price_per_player: 37,
    max_players: 14,
    spots_filled: 5,
    distance_m: null,
    host_id: 'h1',
    host_name: 'Ahmed',
    host_avatar: null,
    pitch_id: 'p1',
    pitch_name: 'Pitch A',
    venue_name: 'Venue A',
    venue_city: 'Riyadh',
    ...overrides,
  };
}

// Helper: build a minimal API-shaped match detail
function makeApiMatchDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm1',
    title: 'Test Match',
    match_type: 'Casual',
    gender_rule: 'Men Only',
    status: 'Open',
    scheduled_at: '2026-08-10T18:00:00.000Z',
    duration_mins: 60,
    price_per_player: '37.00',
    max_players: 14,
    host: {
      id: 'h1',
      full_name: 'Ahmed',
      handle: '@ahmed',
      avatar_url: null,
      rating: 4.5,
    },
    pitch: {
      name: 'Pitch A',
      surface_type: 'Artificial',
      venue: {
        name: 'Venue A',
        city: 'Riyadh',
        address: '123 Main St',
      },
    },
    players: [],
    messages: [],
    ...overrides,
  };
}

describe('useMatches hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useMatches', () => {
    it('fetches nearby matches with correct endpoint', async () => {
      const apiRow = makeApiMatch();
      mockFetcher.mockResolvedValue([apiRow]);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMatches(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches', expect.objectContaining({}));
      // Should return adapted matches
      expect(result.current.data?.matches).toHaveLength(1);
      expect(result.current.data?.matches[0].id).toBe('m1');
      expect(result.current.data?.matches[0].title).toBe('Test Match');
      expect(result.current.data?.matches[0].organizer.name).toBe('Ahmed');
    });

    it('passes date filter as query param when provided', async () => {
      mockFetcher.mockResolvedValue([]);

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useMatches({ date: '2026-08-10' }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches', {
        params: { date: '2026-08-10' },
      });
    });

    it('handles error state when fetch fails', async () => {
      mockFetcher.mockRejectedValue(new Error('Network error'));

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMatches(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.data).toBeUndefined();
    });

    it('does not pass empty filters as params', async () => {
      mockFetcher.mockResolvedValue([]);

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useMatches({ date: null, city: null, format: null, maxPrice: null }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches', {});
    });

    it('handles wrapped response format', async () => {
      const apiRow = makeApiMatch({ id: 'm2' });
      mockFetcher.mockResolvedValue({ matches: [apiRow], total: 1, hasMore: false });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMatches(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.matches).toHaveLength(1);
      expect(result.current.data?.matches[0].id).toBe('m2');
    });
  });

  describe('useMatch', () => {
    it('fetches a single match by ID', async () => {
      const apiDetail = makeApiMatchDetail();
      mockFetcher.mockResolvedValue(apiDetail);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMatch('m1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches/m1');
      expect(result.current.data?.id).toBe('m1');
      expect(result.current.data?.title).toBe('Test Match');
      expect(result.current.data?.organizer.name).toBe('Ahmed');
      expect(result.current.data?.organizer.rating).toBe(4.5);
    });

    it('does not fetch when id is empty', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMatch(''), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetcher).not.toHaveBeenCalled();
    });
  });

  describe('useCreateMatch', () => {
    it('calls POST /matches with correct payload', async () => {
      const apiDetail = makeApiMatchDetail({ id: 'm_new' });
      mockFetcher.mockResolvedValue(apiDetail);

      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useCreateMatch(), { wrapper });

      const payload = {
        pitch_id: 'venue-1',
        title: '7v7 Match',
        match_type: 'Casual' as const,
        gender_rule: 'Men Only' as const,
        scheduled_at: '2026-08-10T18:00:00.000Z',
        duration_mins: 60,
        max_players: 14,
        pitchCostSar: 37,
      };

      await waitFor(() => {
        result.current.mutate(payload);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      expect(result.current.data?.id).toBe('m_new');
      // Should invalidate the matches query cache
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches'] });
    });

    it('handles creation error', async () => {
      mockFetcher.mockRejectedValue(new Error('Server error'));

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useCreateMatch(), { wrapper });

      await waitFor(() => {
        result.current.mutate({
          pitch_id: 'venue-1',
          title: '5v5 Match',
          match_type: 'Casual' as const,
          gender_rule: 'Men Only' as const,
          scheduled_at: '2026-08-10T18:00:00.000Z',
          duration_mins: 60,
          max_players: 10,
          pitchCostSar: 30,
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(Error);
    });
  });
});
