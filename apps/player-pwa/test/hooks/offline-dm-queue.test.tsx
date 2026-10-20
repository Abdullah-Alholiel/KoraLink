/**
 * P2-224 (run #148): offline queue for PERSONAL-DM sends.
 *
 * Mirrors the P2-172 match-chat suite (offline-chat-queue.test.tsx), adapted
 * to the DM surface (useConversations + lib/offline-dm-queue):
 * 1. An offline send parks in the persisted queue with `queued` status —
 *    no fetch is attempted, no failure UX.
 * 2. flushOfflineDmQueue() replays with the SAME clientMessageId (idempotent
 *    replay; the server dedupes on that key), discards the entry, and
 *    notifies flush listeners so an open thread flips queued → sent.
 * 3. A flush failure (still offline / server down) keeps the entry queued
 *    and flips the open thread's bubble to failed (never a stuck spinner).
 * 4. A queued entry from a PREVIOUS session backfills into a newly-opened
 *    thread's merged view (never vanishes across reloads).
 * 5. No online send ever touches the queue; a normal online send still works.
 *
 * Timer strategy: real timers — the queue paths don't need fake timers, and
 * React Query internals starve under them (see offline-chat-queue.test.tsx).
 * Transport: real RealtimeClient singleton with a raw socket stub injected
 * through setSocketFactory (proven useConversationReadReceipts pattern).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { useConversationMessages } from '@/hooks/useConversations';
import { useAppStore } from '@/store/useAppStore';
import { getRealtime } from '@/lib/realtime';
import {
  enqueueOfflineDm,
  getOfflineDmQueueCount,
  flushOfflineDmQueue,
  startOfflineDmQueueWatcher,
  __resetOfflineDmQueueForTests,
} from '@/lib/offline-dm-queue';

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

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureError: vi.fn(),
}));

// Minimal transport double injected through the RealtimeClient seam.
function makeSocketStub() {
  const emitted: { event: string; payload: unknown }[] = [];
  let onAnyCb: ((event: string, ...args: unknown[]) => void) | null = null;
  const socket = {
    connected: true,
    on: vi.fn(),
    onAny: vi.fn((cb: (event: string, ...args: unknown[]) => void) => {
      onAnyCb = cb;
    }),
    emit: vi.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload });
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    __fireServerEvent: (event: string, payload: unknown) =>
      onAnyCb?.(event, payload),
  };
  return { socket, emitted };
}

type SocketStub = ReturnType<typeof makeSocketStub>;
let sock: SocketStub;

const CONV_ID = 'conv-1';
const ME = {
  id: 'user-me',
  fullName: 'Test User',
  handle: 'tester',
  avatarUrl: '',
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

/** Seed the history query so no history GET is needed. */
function seedHistory(queryClient: QueryClient, messages: unknown[]) {
  queryClient.setQueryData(['conversation', CONV_ID, 'messages'], messages);
}

// navigator.onLine control (setup.ts jsdom defaults to true).
function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

function parkEntry(clientMessageId: string, content: string, userId = ME.id) {
  enqueueOfflineDm({
    conversationId: CONV_ID,
    content,
    clientMessageId,
    queuedAt: new Date().toISOString(),
    userId,
  });
}

beforeEach(() => {
  __resetOfflineDmQueueForTests();
  mockFetcher.mockReset();
  // Fresh singleton per test; inject the controllable stub transport.
  const rt = getRealtime();
  rt.teardown();
  sock = makeSocketStub();
  rt.setSocketFactory(() => sock.socket as never);
  useAppStore.setState({ user: { ...ME, phone: '+966****0001' } as never });
  setOnline(true);
  sock.socket.connected = true;
});

afterEach(() => {
  __resetOfflineDmQueueForTests();
  setOnline(true);
});

describe('offline DM queue (P2-224, run #148)', () => {
  /** URL-routed fetcher default (pitfall rule): history GETs resolve with the
   * seeded shape; unrelated invalidation refetches never reject. */
  function routeFetcherDefault() {
    mockFetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.reject(new Error('unexpected POST in this test'));
      }
      return Promise.resolve([]);
    });
  }

  beforeEach(() => {
    routeFetcherDefault();
  });

  it('queues an offline send with status `queued` and never hits the wire', async () => {
    setOnline(false);
    sock.socket.connected = false;
    const { Wrapper, queryClient } = makeWrapper();
    seedHistory(queryClient, []);

    const { result } = renderHook(() => useConversationMessages(CONV_ID), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.sendMessage.mutate({
        content: 'metro msg',
        clientMessageId: 'cmid-off-1',
      });
    });

    // The bubble flips queued (no failure UX), nothing was emitted or posted,
    // and the entry is parked owner-bound.
    await waitFor(() => {
      const queued = result.current.messages.find(
        (m) => m.clientMessageId === 'cmid-off-1',
      );
      expect(queued?.status).toBe('queued');
    });
    expect(sock.emitted.filter((e) => e.event === 'send-dm')).toHaveLength(0);
    expect(mockFetcher.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')).toHaveLength(0);
    expect(result.current.queuedCount).toBe(1);
    expect(getOfflineDmQueueCount(CONV_ID, ME.id)).toBe(1);
  });

  it('flushOfflineDmQueue replays with the SAME clientMessageId and flips the open thread to sent', async () => {
    parkEntry('cmid-off-2', 'parked');

    const { Wrapper, queryClient } = makeWrapper();
    seedHistory(queryClient, []);

    const { result } = renderHook(() => useConversationMessages(CONV_ID), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Backfilled into the view as queued.
    expect(
      result.current.messages.find((m) => m.clientMessageId === 'cmid-off-2')?.status,
    ).toBe('queued');

    mockFetcher.mockImplementationOnce((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith(`/conversations/${CONV_ID}/messages`)) {
        return Promise.resolve({ id: 'srv-1', client_message_id: 'cmid-off-2' });
      }
      return Promise.resolve([]);
    });

    await act(async () => {
      await flushOfflineDmQueue();
    });

    // Replayed with the SAME idempotency key, entry discarded, view flipped.
    const postCalls = mockFetcher.mock.calls.filter(
      ([, init]) => (init as RequestInit)?.method === 'POST',
    );
    expect(postCalls).toHaveLength(1);
    const [url, init] = postCalls[0];
    expect(url).toBe(`/conversations/${CONV_ID}/messages`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      content: 'parked',
      clientMessageId: 'cmid-off-2',
    });
    expect(getOfflineDmQueueCount(CONV_ID, ME.id)).toBe(0);
    await waitFor(() => {
      expect(
        result.current.messages.find((m) => m.clientMessageId === 'cmid-off-2')?.status,
      ).toBe('sent');
    });
  });

  it('keeps the entry queued and flips the bubble to failed when the flush fails', async () => {
    parkEntry('cmid-off-3', 'parked');

    const { Wrapper, queryClient } = makeWrapper();
    seedHistory(queryClient, []);
    const { result } = renderHook(() => useConversationMessages(CONV_ID), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetcher.mockImplementationOnce((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.reject(new Error('still unreachable'));
      }
      return Promise.resolve([]);
    });

    await act(async () => {
      await flushOfflineDmQueue();
    });

    await waitFor(() => {
      expect(
        result.current.messages.find((m) => m.clientMessageId === 'cmid-off-3')?.status,
      ).toBe('failed');
    });
    // Still parked for the next flush cycle / manual retry.
    expect(getOfflineDmQueueCount(CONV_ID, ME.id)).toBe(1);
  });

  it('backfills a PREVIOUS-session queued entry into a fresh thread as `queued`', async () => {
    parkEntry('cmid-off-4', 'from yesterday');

    const { Wrapper, queryClient } = makeWrapper();
    seedHistory(queryClient, []);
    const { result } = renderHook(() => useConversationMessages(CONV_ID), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const backfilled = result.current.messages.find(
      (m) => m.clientMessageId === 'cmid-off-4',
    );
    expect(backfilled?.status).toBe('queued');
    expect(backfilled?.content).toBe('from yesterday');
    // No wire traffic was needed to surface it.
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it('a flush replays ONLY the current account entries and leaves others parked (cross-account guard)', async () => {
    parkEntry('cmid-mine', 'mine');
    parkEntry('cmid-theirs', 'theirs', 'user-other');

    mockFetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ id: 'srv-1' });
      }
      return Promise.resolve([]);
    });
    await act(async () => {
      await flushOfflineDmQueue();
    });

    const postCalls = mockFetcher.mock.calls.filter(
      ([, init]) => (init as RequestInit)?.method === 'POST',
    );
    expect(postCalls).toHaveLength(1);
    const body = JSON.parse((postCalls[0][1] as RequestInit).body as string);
    expect(body.clientMessageId).toBe('cmid-mine');
    expect(getOfflineDmQueueCount(CONV_ID, ME.id)).toBe(0);
    expect(getOfflineDmQueueCount(CONV_ID, 'user-other')).toBe(1);
  });

  it('an online send bypasses the queue entirely and still works', async () => {
    const { Wrapper, queryClient } = makeWrapper();
    seedHistory(queryClient, []);
    const { result } = renderHook(() => useConversationMessages(CONV_ID), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.sendMessage.mutate({
        content: 'online hello',
        clientMessageId: 'cmid-on-1',
      });
    });

    // Socket path: emitted, no REST POST, no queue writes.
    await waitFor(() => expect(sock.emitted.some((e) => e.event === 'send-dm')).toBe(true));
    const sendDm = sock.emitted.find((e) => e.event === 'send-dm');
    expect(sendDm?.payload).toEqual(
      expect.objectContaining({ conversationId: CONV_ID, content: 'online hello' }),
    );
    expect(
      mockFetcher.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST'),
    ).toHaveLength(0);
    expect(getOfflineDmQueueCount(CONV_ID, ME.id)).toBe(0);
  });

  it('an offline send with NO logged-in user fails loudly instead of parking an orphan', async () => {
    setOnline(false);
    sock.socket.connected = false;
    useAppStore.setState({ user: null as never });
    try {
      const { Wrapper, queryClient } = makeWrapper();
      seedHistory(queryClient, []);
      const { result } = renderHook(() => useConversationMessages(CONV_ID), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.sendMessage.mutate({
          content: 'orphan',
          clientMessageId: 'cmid-orphan',
        });
      });

      await waitFor(() => {
        expect(
          result.current.messages.find((m) => m.clientMessageId === 'cmid-orphan')
            ?.status,
        ).toBe('failed');
      });
      expect(getOfflineDmQueueCount(CONV_ID)).toBe(0);
    } finally {
      useAppStore.setState({ user: { ...ME, phone: '+966****0001' } as never });
    }
  });

  it('arm/start watcher is idempotent (no duplicate flush loops)', () => {
    expect(() => {
      startOfflineDmQueueWatcher();
      startOfflineDmQueueWatcher();
      startOfflineDmQueueWatcher();
    }).not.toThrow();
  });
});
