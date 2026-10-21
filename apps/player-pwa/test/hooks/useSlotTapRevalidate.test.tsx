import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * useSlotTapRevalidate — tap-time slot availability revalidation (P2-234).
 *
 * Uses a REAL QueryClient (no mocks) so the dataUpdateCount fresh-read
 * semantics are exercised against actual cache behavior: a failed refetch
 * keeps the old count, a successful one advances it, and only an advanced
 * count may accuse the tapped slot.
 */

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

import { useSlotTapRevalidate } from '@/hooks/useSlotTapRevalidate';
import type { PitchSlotApi } from '@/hooks/usePitchSlots';

const DAY = '2026-10-21';
const FREE: PitchSlotApi = {
  id: 's1',
  pitch_id: 'p1',
  slot_date: DAY,
  start_time: '18:00:00',
  end_time: '19:00:00',
  is_booked: false,
  booked_match_id: null,
};
const TAKEN: PitchSlotApi = { ...FREE, is_booked: true };
const OTHER: PitchSlotApi = { ...FREE, id: 's2', start_time: '20:00:00' };

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

/** Seed the cache with one read so countBefore has a baseline. */
async function seedCache(queryClient: QueryClient, data: PitchSlotApi[]) {
  mockFetcher.mockResolvedValueOnce(data);
  await queryClient.prefetchQuery({
    queryKey: ['pitch-slots', 'p1', DAY],
    queryFn: () => mockFetcher(),
  });
}

function renderTapRevalidate(
  wrapper: (props: { children: React.ReactNode }) => React.ReactNode,
  opts?: { pitchId?: string | null; date?: string | null; isCommitting?: boolean },
) {
  const onSelect = vi.fn();
  const onTaken = vi.fn();
  const rendered = renderHook(
    () =>
      useSlotTapRevalidate(
        opts?.pitchId === undefined ? 'p1' : opts.pitchId,
        opts?.date === undefined ? DAY : opts.date,
        {
          onSelect,
          onTaken,
          isCommitting: opts?.isCommitting,
        },
      ),
    { wrapper },
  );
  return { ...rendered, onSelect, onTaken };
}

describe('useSlotTapRevalidate (P2-234)', () => {
  beforeEach(() => {
    mockFetcher.mockReset();
  });

  it('refuses the pick when the fresh read shows the slot booked', async () => {
    const { wrapper, queryClient } = createWrapper();
    await seedCache(queryClient, [FREE]); // stale snapshot: looks free
    mockFetcher.mockResolvedValue([TAKEN]); // fresh read: just booked

    const { result, onTaken, onSelect } = renderTapRevalidate(wrapper);

    result.current.handleSelect(FREE);
    await waitFor(() => expect(onTaken).toHaveBeenCalledTimes(1));

    expect(onSelect).toHaveBeenCalledWith(FREE); // optimistic first
    expect(result.current.slotTaken).toBe(true);
  });

  it('keeps the pick when the fresh read still shows the slot free', async () => {
    const { wrapper, queryClient } = createWrapper();
    await seedCache(queryClient, [FREE]);
    mockFetcher.mockResolvedValue([FREE, OTHER]);

    const { result, onTaken, onSelect } = renderTapRevalidate(wrapper);

    result.current.handleSelect(FREE);
    await waitFor(() =>
      expect(queryClient.getQueryState(['pitch-slots', 'p1', DAY])?.dataUpdateCount).toBe(2),
    );

    expect(onTaken).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(result.current.slotTaken).toBe(false);
  });

  it('never accuses on a failed refetch (no fresh read → no verdict)', async () => {
    const { wrapper, queryClient } = createWrapper();
    await seedCache(queryClient, [FREE]);
    mockFetcher.mockRejectedValue(new Error('network down'));

    const { result, onTaken, onSelect } = renderTapRevalidate(wrapper);

    result.current.handleSelect(FREE);
    await waitFor(() => expect(mockFetcher).toHaveBeenCalled());
    // Give the rejection chain a tick to settle.
    await new Promise((r) => setTimeout(r, 20));

    expect(onTaken).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1); // pick stands
    expect(result.current.slotTaken).toBe(false);
  });

  it('recovers: re-tapping after a refusal with the slot free again clears the flag', async () => {
    const { wrapper, queryClient } = createWrapper();
    await seedCache(queryClient, [FREE]);
    mockFetcher.mockResolvedValueOnce([TAKEN]); // first tap: booked

    const { result, onTaken } = renderTapRevalidate(wrapper);
    result.current.handleSelect(FREE);
    await waitFor(() => expect(onTaken).toHaveBeenCalledTimes(1));
    expect(result.current.slotTaken).toBe(true);

    mockFetcher.mockResolvedValueOnce([FREE]); // second tap: free again
    result.current.handleSelect(FREE);
    await waitFor(() =>
      expect(queryClient.getQueryState(['pitch-slots', 'p1', DAY])?.dataUpdateCount).toBe(3),
    );

    expect(onTaken).toHaveBeenCalledTimes(1); // NOT accused twice
    expect(result.current.slotTaken).toBe(false);
  });

  it('ignores taps while a parent mutation is committing', async () => {
    const { wrapper, queryClient } = createWrapper();
    await seedCache(queryClient, [FREE]);

    const { result, onSelect } = renderTapRevalidate(wrapper, {
      isCommitting: true,
    });

    result.current.handleSelect(FREE);
    await new Promise((r) => setTimeout(r, 20));

    expect(onSelect).not.toHaveBeenCalled();
    expect(mockFetcher).toHaveBeenCalledTimes(1); // only the seed read
  });

  it('ignores taps with no pitch/date context (null-arg guard)', async () => {
    const { wrapper, queryClient } = createWrapper();
    await seedCache(queryClient, [FREE]);

    const { result, onSelect } = renderTapRevalidate(wrapper, {
      pitchId: null,
      date: null,
    });

    result.current.handleSelect(FREE);
    await new Promise((r) => setTimeout(r, 20));

    expect(onSelect).not.toHaveBeenCalled();
    expect(mockFetcher).toHaveBeenCalledTimes(1); // only the seed read
  });

  // Note (PR-Agent r2 MINOR — superseded-tap race): the production hook
  // guards every reconciliation with a per-tap sequence token so a previous
  // tap's in-flight revalidation can never accuse a newer tap's selection.
  // That race is not reproducible in jsdom: with no query observers, React
  // Query suppresses the cache update when a second refetchQueries joins
  // the same key mid-flight (verified by probe — dataUpdateCount stays at
  // the seed value), so any attempt to simulate "A's fetch lands after B"
  // cannot discriminate token vs no-token. The guard is a no-op for every
  // buildable scenario here (single tap: seq === tapSeq.current), which is
  // why the suites above stay green with it in place.
});
