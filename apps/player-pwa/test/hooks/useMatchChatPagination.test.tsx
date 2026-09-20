import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

const mockHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
const mockEmit = vi.fn();
const mockDisconnect = vi.fn();
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    connected: false,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      const list = mockHandlers.get(event) ?? [];
      list.push(handler);
      mockHandlers.set(event, list);
    },
    emit: (...args: unknown[]) => mockEmit(...args),
    disconnect: () => mockDisconnect(),
  })),
}));

vi.mock('@/store/useAppStore', () => {
  const selectUser = (s: { user?: { id: string } }) => s.user;
  const useAppStore = Object.assign(
    (selector: (s: { user?: { id: string } }) => unknown) =>
      selector({ user: { id: 'user-me' } }),
    { getState: () => ({ user: { id: 'user-me' } }), selectUser },
  );
  return { useAppStore, selectUser };
});

import { useMatchChat } from '@/hooks/useMessages';

/**
 * P1-3 (run #65): chat history cursor pagination in useMatchChat.
 * - Probe fetches limit=51 (PAGE+1); a full page ⇒ hasMore.
 * - loadOlder pages with before=<oldest displayed id> and prepends
 *   chronologically with dedup.
 * - The merged view stays oldest-first across pages + local messages.
 */

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

function msg(i: number, matchId = 'm1'): {
  id: string;
  match_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user: { id: string; full_name: string | null; handle: string | null; avatar_url: string | null };
} {
  const t = new Date(Date.UTC(2026, 8, 1, 12, i));
  return {
    id: `srv-${String(i).padStart(3, '0')}`,
    match_id: matchId,
    user_id: 'user-other',
    content: `msg ${i}`,
    created_at: t.toISOString(),
    user: { id: 'user-other', full_name: 'Other', handle: null, avatar_url: null },
  };
}

const PAGE = 50;

function page(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, k) => msg(a + k));
}

describe('useMatchChat — P1-3 history pagination (run #65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();
    mockFetcher.mockResolvedValue([]);
  });

  it('probes limit=51 and flags hasMore only when the probe is full', async () => {
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') return Promise.resolve(page(1, 51));
      return Promise.resolve({ ok: true });
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper });

    await waitFor(() => expect(result.current.messages).toHaveLength(50));
    expect(mockFetcher).toHaveBeenCalledWith('/matches/m1/messages?limit=51', {
      method: 'GET',
    });
    expect(result.current.hasMore).toBe(true);
    // The authoritative window is the newest 50 — the 51st (oldest) is dropped.
    expect(result.current.messages[0].id).toBe('srv-002');
  });

  it('loadOlder fetches before=<oldest id>&limit=50 and prepends chronologically with dedup', async () => {
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') return Promise.resolve(page(1, 51));
      if (url === '/matches/m1/messages?before=srv-002&limit=50')
        return Promise.resolve(page(-49, 0)); // 50 OLDER messages, ASC
      return Promise.resolve({ ok: true });
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(50));

    await act(() => result.current.loadOlder());

    expect(result.current.messages).toHaveLength(100);
    expect(result.current.messages[0].id).toBe('srv--49'); // oldest first
    expect(result.current.messages[49].id).toBe('srv-000'); // older page end
    expect(result.current.messages[50].id).toBe('srv-002'); // window intact
    // hasMore recalculates from the ORIGINAL probe (not the paged buffer)
    expect(result.current.hasMore).toBe(true);

    // A second loadOlder advances the cursor to the new oldest message.
    await act(() => result.current.loadOlder());
    const olderCalls = mockFetcher.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('before='),
    );
    expect(olderCalls).toHaveLength(2);
    expect(olderCalls[1][0]).toBe('/matches/m1/messages?before=srv--49&limit=50');
  });

  it('loadOlder is a no-op when hasMore history already loaded fully (no cursor)', async () => {
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') return Promise.resolve(page(1, 10));
      return Promise.resolve({ ok: true });
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(10));
    expect(result.current.hasMore).toBe(false);

    // No oldest-server message guard: with 10 < PAGE the affordance is hidden
    // anyway; loadOlder would still page — but ChatSheet never calls it.
    await act(() => result.current.loadOlder());
    const pagingCalls = mockFetcher.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('before='),
    );
    expect(pagingCalls).toHaveLength(0); // nothing older locally → no fetch
  });

  it('a failed loadOlder stays silent (affordance remains, no crash)', async () => {
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') return Promise.resolve(page(1, 51));
      if (url === '/matches/m1/messages?before=srv-002&limit=50')
        return Promise.reject(new Error('network down'));
      return Promise.resolve({ ok: true });
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(50));

    await act(() => result.current.loadOlder());
    expect(result.current.messages).toHaveLength(50); // unchanged
    expect(result.current.isLoadingOlder).toBe(false);
  });
});
