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

describe('useMatches hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useMatches', () => {
    it('fetches nearby matches with correct endpoint', async () => {
      const mockData = {
        matches: [{ id: 'm1', title: 'Test Match' }],
        total: 1,
        hasMore: false,
      };
      mockFetcher.mockResolvedValue(mockData);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMatches(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches', expect.objectContaining({}));
      expect(result.current.data).toEqual(mockData);
    });

    it('passes date filter as query param when provided', async () => {
      mockFetcher.mockResolvedValue({ matches: [], total: 0, hasMore: false });

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
      mockFetcher.mockResolvedValue({ matches: [], total: 0, hasMore: false });

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useMatches({ date: null, city: null, format: null, maxPrice: null }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches', {});
    });
  });

  describe('useMatch', () => {
    it('fetches a single match by ID', async () => {
      const mockMatch = { id: 'm1', title: 'Test Match' };
      mockFetcher.mockResolvedValue(mockMatch);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMatch('m1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches/m1');
      expect(result.current.data).toEqual(mockMatch);
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
      const mockMatch = { id: 'm1', title: 'New Match' };
      mockFetcher.mockResolvedValue(mockMatch);

      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useCreateMatch(), { wrapper });

      const payload = {
        venueId: 'venue-1',
        format: '7v7',
        date: '2026-08-10',
        time: '18:00',
        isPublic: true,
        bookingMode: 'self' as const,
        price: 37,
      };

      await waitFor(() => {
        result.current.mutate(payload);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/matches', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Should invalidate the matches query cache
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['matches'] });
    });

    it('handles creation error', async () => {
      mockFetcher.mockRejectedValue(new Error('Server error'));

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useCreateMatch(), { wrapper });

      await waitFor(() => {
        result.current.mutate({
          venueId: 'venue-1',
          format: '5v5',
          date: '2026-08-10',
          time: '18:00',
          isPublic: true,
          bookingMode: 'self',
          price: 30,
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(Error);
    });
  });
});
