import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mocks (before importing the hook) ────────────────────────────────

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

/**
 * Controllable lobby-socket stub: injected through the RealtimeClient
 * `setSocketFactory` seam (Slice 2). The test fires the `connect` handler
 * and asserts on emits — mirroring how useMatchChat drives the shared
 * realtime client. `connected` mirrors the real Socket property the hook
 * consults when choosing WS vs REST.
 */
type Handler = (...args: unknown[]) => void;
type StubSocket = {
  connected: boolean;
  on: (event: string, handler: Handler) => void;
  onAny: (handler: Handler) => void;
  emit: (...args: unknown[]) => void;
  disconnect: () => void;
};
const stubSocket: StubSocket = {
  connected: false,
  on(event, handler) {
    const list = mockHandlers.get(event) ?? [];
    list.push(handler);
    mockHandlers.set(event, list);
  },
  onAny() {
    // RealtimeClient routes server events through onAny; the tests here
    // only exercise emits + the connect lifecycle, so nothing to record.
  },
  emit: (...args) => mockEmit(...args),
  disconnect: () => mockDisconnect(),
};
const mockHandlers = new Map<string, Handler[]>();
const mockEmit = vi.fn();
const mockDisconnect = vi.fn();

import { getRealtime } from '@/lib/realtime';

vi.mock('@/store/useAppStore', () => {
  const selectUser = (s: { user?: { id: string } }) => s.user;
  const useAppStore = Object.assign(
    (selector: (s: { user?: { id: string } }) => unknown) => selector({ user: { id: 'user-me' } }),
    {
      getState: () => ({ user: { id: 'user-me' } }),
      selectUser,
    },
  );
  return { useAppStore, selectUser };
});

import { useMatchChat } from '@/hooks/useMessages';

function connect() {
  for (const h of mockHandlers.get('connect') ?? []) h();
}

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

describe('useMatchChat read watermark (P2-58, run #50)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();
    mockFetcher.mockResolvedValue([]);
    // Fresh singleton per test; inject the controllable stub transport.
    const rt = getRealtime();
    rt.teardown();
    rt.setSocketFactory(() => stubSocket as never);
    (stubSocket as { connected: boolean }).connected = false;
  });

  it('MW-1: fresh sheet open marks read via REST (socket not yet connected)', async () => {
    stubSocket.connected = false;
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') return Promise.resolve([]);
      return Promise.resolve({ ok: true }); // the read fallback POST
    });

    const { wrapper } = createWrapper();
    renderHook(() => useMatchChat('m1'), { wrapper });

    // The socket connects asynchronously — at open time the hook must take
    // the REST path immediately, never wait for the socket.
    await waitFor(() => {
      expect(mockFetcher).toHaveBeenCalledWith(
        '/matches/m1/messages/read',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(mockEmit).not.toHaveBeenCalledWith('mark-chat-read', expect.anything());
  });

  it('MW-2: open (socket already connected) marks read via the WS emit, not REST', async () => {
    // Slice 2: the shared client can genuinely be CONNECTED when the sheet
    // opens (another consumer kept it alive) — impossible with the old
    // per-hook socket, whose handshake was always pending at open. The
    // contract is the watermark write happens once, via the available
    // channel: WS here, REST only when the socket is down (MW-1).
    stubSocket.connected = true;
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') {
        return Promise.resolve([
          {
            id: 'srv-1',
            match_id: 'm1',
            user_id: 'user-other',
            content: 'hello',
            created_at: new Date().toISOString(),
          },
        ]);
      }
      return Promise.resolve({ ok: true });
    });

    const { wrapper } = createWrapper();
    renderHook(() => useMatchChat('m1'), { wrapper });

    connect();

    await waitFor(() => {
      expect(mockEmit).toHaveBeenCalledWith('mark-chat-read', { matchId: 'm1' });
    });
    // WS was available at open — the REST read path must not be used.
    expect(mockFetcher).not.toHaveBeenCalledWith(
      '/matches/m1/messages/read',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockEmit).toHaveBeenCalledWith('mark-chat-read', { matchId: 'm1' });
  });

  it('MW-3: does nothing when matchId is null (sheet closed → matchId null)', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useMatchChat(null), { wrapper });

    connect(); // even a connect fires nothing — no match to mark
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it('MW-4: a late socket connect does not duplicate the open-mark write', async () => {
    stubSocket.connected = false;
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') return Promise.resolve([]);
      return Promise.resolve({ ok: true });
    });

    const { wrapper } = createWrapper();
    renderHook(() => useMatchChat('m1'), { wrapper });

    await waitFor(() => {
      expect(mockFetcher).toHaveBeenCalledWith(
        '/matches/m1/messages/read',
        expect.anything(),
      );
    });

    connect(); // socket comes up after the REST open-mark

    // No WS mark-chat-read: the write already happened this open-cycle.
    expect(mockEmit).not.toHaveBeenCalledWith('mark-chat-read', expect.anything());
  });

  it('MW-5: one watermark write per batch of unseen messages, own messages excluded', async () => {
    const others = ['srv-a', 'srv-b', 'srv-c'].map((id) => ({
      id,
      match_id: 'm1',
      user_id: 'user-other',
      content: 'hi',
      created_at: new Date().toISOString(),
    }));
    const mine = [
      {
        id: 'srv-own',
        match_id: 'm1',
        user_id: 'user-me', // the current user — must NOT trigger a write
        content: 'my own',
        created_at: new Date().toISOString(),
      },
    ];
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') return Promise.resolve([...others, ...mine]);
      return Promise.resolve({ ok: true });
    });

    const { wrapper } = createWrapper();
    renderHook(() => useMatchChat('m1'), { wrapper });

    await waitFor(() => {
      expect(mockFetcher).toHaveBeenCalledWith(
        '/matches/m1/messages/read',
        expect.anything(),
      );
    });
    // open-mark + at most ONE batch write — never per message.
    const readCalls = mockFetcher.mock.calls.filter(
      (c) => c[0] === '/matches/m1/messages/read',
    );
    expect(readCalls.length).toBeLessThanOrEqual(2);
    expect(readCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('MW-6: dedup set resets on match switch (P2-62, run #51) — no stale suppression', async () => {
    stubSocket.connected = true;
    const msg = (id: string, matchId: string) => ({
      id,
      match_id: matchId,
      user_id: 'user-other',
      content: 'hello',
      created_at: new Date().toISOString(),
    });
    mockFetcher.mockImplementation((url: string) => {
      if (url === '/matches/m1/messages?limit=51') return Promise.resolve([msg('srv-1', 'm1')]);
      if (url === '/matches/m2/messages?limit=51') return Promise.resolve([msg('srv-2', 'm2')]);
      return Promise.resolve({ ok: true });
    });

    const { wrapper } = createWrapper();
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useMatchChat(id),
      { wrapper, initialProps: { id: 'm1' as string | null } },
    );

    connect();

    // m1's unseen srv-1 gets marked (open-mark and/or batch — any channel).
    await waitFor(() => {
      expect(mockEmit).toHaveBeenCalledWith('mark-chat-read', { matchId: 'm1' });
    });
    // (assert on ONE channel so the reset claim stays precise)
    const m1WsMarks = mockEmit.mock.calls.filter(
      (c) => c[0] === 'mark-chat-read' && c[1]?.matchId === 'm1',
    ).length;
    expect(m1WsMarks).toBeGreaterThanOrEqual(1);

    mockEmit.mockClear();

    // Switch the SAME hook instance to m2 — the ref must reset, so m2's own
    // unseen srv-2 is NOT suppressed by m1's leftover dedup entries.
    rerender({ id: 'm2' });
    connect();

    await waitFor(() => {
      expect(mockEmit).toHaveBeenCalledWith('mark-chat-read', { matchId: 'm2' });
    });
    const m2WsMarks = mockEmit.mock.calls.filter(
      (c) => c[0] === 'mark-chat-read' && c[1]?.matchId === 'm2',
    ).length;
    expect(m2WsMarks).toBeGreaterThanOrEqual(1);
  });
});
