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

// Same controllable-transport seam as useMatchChatTyping.test.tsx.
const mockHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
let onAnyBridge: ((event: string, ...args: unknown[]) => void) | null = null;

const stubSocket = {
  get connected() {
    return true;
  },
  on: (event: string, handler: (...args: unknown[]) => void) => {
    const list = mockHandlers.get(event) ?? [];
    list.push(handler);
    mockHandlers.set(event, list);
  },
  onAny: (cb: (event: string, ...args: unknown[]) => void) => {
    onAnyBridge = cb;
  },
  emit: vi.fn(),
  disconnect: () => {},
};

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
import { getRealtime } from '@/lib/realtime';

// Route the singleton's transport through the stub for this suite.
getRealtime().setSocketFactory(() => stubSocket as never);

/**
 * P2-196 (run #132): lobby-chat reconnect backfill.
 * - the FIRST `connect` never backfills (initial REST probe covers it);
 * - a RE-connect pages the server with `after=<newest known id>` and
 *   reconciles the missed rows into the merged view;
 * - genuinely-new rows arm `missedMarker` {count, firstId}; an empty page
 *   does not;
 * - the marker clears on dismiss and when the user composes a message.
 */

const M1 = 'match-bf-1';

function msg(id: string, created_at: string) {
  return {
    id,
    match_id: M1,
    user_id: 'peer-1',
    content: `c-${id}`,
    created_at,
    user: { id: 'peer-1', full_name: 'Peer', handle: 'peer', avatar_url: '' },
  };
}

let initialHistory: ReturnType<typeof msg>[] = [];
let backfillPage: ReturnType<typeof msg>[] = [];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return TestWrapper;
}

function fire(event: string, payload?: unknown) {
  // Lifecycle events (connect/disconnect/connect_error) ride ONLY the
  // socket.on handlers in production (socket.io never emits them through
  // onAny) — routing them through onAnyBridge too would double-fire the
  // hook's handler (stub handler → realtime fanout + bridge → fanout).
  const lifecycle = event === 'connect' || event === 'disconnect' || event === 'connect_error';
  if (!lifecycle && onAnyBridge) onAnyBridge(event, payload);
  for (const h of mockHandlers.get(event) ?? []) h(payload);
}

function fetchUrl(call: unknown[]): string {
  return String(call[0]);
}

describe('useMatchChat reconnect backfill (P2-196, run #132)', () => {
  beforeEach(() => {
    getRealtime().teardown();
    mockHandlers.clear();
    onAnyBridge = null;
    mockFetcher.mockReset();
    mockFetcher.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('after=')) return Promise.resolve(backfillPage);
      // Initial history probe (?limit=51) and any other GET.
      return Promise.resolve(initialHistory);
    });
    initialHistory = [msg('m1', '2026-10-14T10:00:00Z'), msg('m2', '2026-10-14T10:01:00Z')];
    backfillPage = [];
  });

  it('first connect does NOT backfill; a RE-connect pages after the newest known id', async () => {
    backfillPage = [msg('m3', '2026-10-14T10:05:00Z')];
    const { result } = renderHook(() => useMatchChat(M1), { wrapper: createWrapper() });

    // History loads; refs now track m2 as the newest known server message.
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']),
    );

    // FIRST connect: backfill must be skipped (the initial probe covered it).
    act(() => fire('connect'));
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(mockFetcher.mock.calls.filter((c) => fetchUrl(c).includes('after='))).toHaveLength(0);

    // Drop + recover → RE-connect backfills with after=<newest known id>.
    act(() => fire('disconnect'));
    act(() => fire('connect'));

    await waitFor(() => {
      const afterCalls = mockFetcher.mock.calls.filter((c) => fetchUrl(c).includes('after='));
      expect(afterCalls).toHaveLength(1);
      expect(fetchUrl(afterCalls[0])).toBe(
        `/matches/${M1}/messages?after=${encodeURIComponent('m2')}&limit=100`,
      );
    });
    // Missed rows are merged into the view in order.
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']),
    );
  });

  it('genuinely-new rows arm missedMarker {count, firstId}; dismiss clears it', async () => {
    backfillPage = [msg('m3', '2026-10-14T10:05:00Z'), msg('m4', '2026-10-14T10:06:00Z')];
    const { result } = renderHook(() => useMatchChat(M1), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']),
    );

    // Initial connect (production: the socket connects right after mount —
    // the latch swallows it; the history probe covered that window).
    act(() => fire('connect'));
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // Drop + recover → RE-connect backfills.
    act(() => fire('disconnect'));
    act(() => fire('connect'));

    await waitFor(() =>
      expect(result.current.missedMarker).toEqual({ count: 2, firstId: 'm3' }),
    );

    act(() => result.current.dismissMissedMarker());
    expect(result.current.missedMarker).toBeNull();
  });

  it('an empty backfill page does NOT arm the marker', async () => {
    backfillPage = [];
    const { result } = renderHook(() => useMatchChat(M1), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']),
    );

    act(() => fire('connect'));
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => fire('disconnect'));
    act(() => fire('connect'));

    await waitFor(() => {
      expect(
        mockFetcher.mock.calls.filter((c) => fetchUrl(c).includes('after=')),
      ).toHaveLength(1);
    });
    // Marker stays null — nothing was missed.
    expect(result.current.missedMarker).toBeNull();
  });

  it('composing a message clears the marker (the user has seen the window)', async () => {
    backfillPage = [msg('m3', '2026-10-14T10:05:00Z')];
    const { result } = renderHook(() => useMatchChat(M1), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']),
    );

    act(() => fire('connect'));
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => fire('disconnect'));
    act(() => fire('connect'));
    await waitFor(() => expect(result.current.missedMarker).not.toBeNull());

    // WS path (stub connected): emit-only send — onMutate clears the marker.
    act(() => {
      result.current.sendMessage.mutate({ content: 'hello', clientMessageId: 'cmid-1' });
    });
    expect(result.current.missedMarker).toBeNull();
  });
});
