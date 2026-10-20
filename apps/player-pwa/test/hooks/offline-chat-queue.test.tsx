/**
 * P2-172 (run #144): offline chat-send queue.
 *
 * Covered behaviors:
 * 1. An offline send parks in the persisted queue with `queued` status —
 *    no fetch is attempted, no failure UX.
 * 2. flushOfflineQueue() replays with the SAME clientMessageId (idempotent
 *    replay; the server dedupes on that key), discards the entry, and
 *    notifies flush listeners so an open sheet flips queued → sent.
 * 3. A flush failure (still offline / server down) keeps the entry queued.
 * 4. A queued entry from a PREVIOUS session backfills into a newly-opened
 *    sheet's merged view (never vanishes across reloads).
 * 5. No online send ever touches the queue; a normal online send still works.
 *
 * Timer strategy: real timers — the queue paths don't need fake timers, and
 * React Query internals starve under them (see useMatchChatTyping.test.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const mockHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
const mockEmit = vi.fn();
let mockConnected = true;
// Captured onAny bridge (production routes server events through it) —
// unused in this suite (no realtime receive paths asserted) but kept for
// scaffold parity with the other useMatchChat suites; eslint-disable guards
// the no-unused-vars rule.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let onAnyBridge: ((event: string, ...args: unknown[]) => void) | null = null;

const stubSocket = {
  get connected() {
    return mockConnected;
  },
  on: (event: string, handler: (...args: unknown[]) => void) => {
    const list = mockHandlers.get(event) ?? [];
    list.push(handler);
    mockHandlers.set(event, list);
  },
  onAny: (cb: (event: string, ...args: unknown[]) => void) => {
    onAnyBridge = cb;
  },
  emit: (...args: unknown[]) => mockEmit(...args),
  disconnect: () => {},
};

vi.mock('@/store/useAppStore', () => {
  type MockUser = {
    id: string;
    fullName: string | null;
    handle: string | null;
    avatarUrl: string | null;
  };
  const mockUser: MockUser = {
    id: 'user-me',
    fullName: 'Test User',
    handle: 'tester',
    avatarUrl: null,
  };
  // Run-#145 orphan-guard test flips this to null (logged out) and restores it.
  let activeUser: MockUser | null = mockUser;
  const selectUser = (s: { user?: MockUser | null }) => s.user;
  const useAppStore = Object.assign(
    (selector: (s: { user: MockUser | null }) => unknown) =>
      selector({ user: activeUser }),
    { getState: () => ({ user: activeUser }), selectUser },
  );
  return {
    useAppStore,
    selectUser,
    // Test-only: flip the active user (null = logged out); undefined restores.
    __setActiveUser: (u?: MockUser | null) => {
      activeUser = u === undefined ? mockUser : u;
    },
  };
});

import {
  useMatchChat,
  flushOfflineQueue,
  registerOfflineFlushListener,
  __resetOfflineChatQueueForTests,
} from '@/hooks/useMessages';
import { getRealtime } from '@/lib/realtime';
import { FetchError } from '@/lib/fetcher';

getRealtime().setSocketFactory(() => stubSocket as never);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return TestWrapper;
}

/** Flip navigator.onLine (jsdom has no real network stack). */
function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
  if (online) window.dispatchEvent(new Event('online'));
  else window.dispatchEvent(new Event('offline'));
}

async function mountChat() {
  const utils = renderHook(() => useMatchChat('m1'), { wrapper: createWrapper() });
  await waitFor(() => expect(utils.result.current.isLoading).toBe(false));
  return utils;
}

describe('offline chat-send queue (P2-172, run #144)', () => {
  // Unregistered per-case in afterEach — mirrors production unmount (the
  // effect's cleanup) and prevents cross-case pollution: the module flusher
  // is a singleton, so a leaked listener keeps firing forever.
  let offFlush: (() => void) | undefined;

  afterEach(() => {
    offFlush?.();
    offFlush = undefined;
  });

  beforeEach(() => {
    __resetOfflineChatQueueForTests();
    getRealtime().teardown();
    mockHandlers.clear();
    mockEmit.mockClear();
    mockConnected = true;
    mockFetcher.mockReset();
    setOnline(true);
    window.localStorage.clear();
  });

  it('queues an offline send with status `queued` and never hits the wire', async () => {
    setOnline(false);
    const { result } = await mountChat();

    act(() => {
      result.current.sendMessage.mutate({
        content: 'offline hello',
        clientMessageId: 'cm-off-1',
      });
    });

    await waitFor(() =>
      expect(result.current.messages.some((m) => m.client_message_id === 'cm-off-1')).toBe(
        true,
      ),
    );
    const bubble = result.current.messages.find((m) => m.client_message_id === 'cm-off-1');
    expect(bubble?.status).toBe('queued');
    expect(result.current.queuedCount).toBe(1);
    // Zero SEND attempts: the mutation threw before reaching fetcher/WS.
    // (The mount-time history GET is expected — filter to POSTs.)
    const posts = mockFetcher.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
    expect(mockEmit).not.toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ clientMessageId: 'cm-off-1' }),
    );
    // Persisted for the next session.
    const stored = JSON.parse(
      window.localStorage.getItem('kl.offlineChatQueue.v1') ?? '[]',
    ) as Array<{ clientMessageId: string; content: string }>;
    expect(stored).toEqual([
      expect.objectContaining({ clientMessageId: 'cm-off-1', content: 'offline hello' }),
    ]);
  });

  it('flushOfflineQueue replays with the SAME clientMessageId and clears the entry', async () => {
    setOnline(false);
    const { result } = await mountChat();
    act(() => {
      result.current.sendMessage.mutate({
        content: 'queued msg',
        clientMessageId: 'cm-flush-1',
      });
    });
    await waitFor(() => expect(result.current.queuedCount).toBe(1));

    // Back online; server accepts the replay.
    setOnline(true);
    mockFetcher.mockResolvedValueOnce({
      id: 'srv-1',
      match_id: 'm1',
      user_id: 'user-me',
      content: 'queued msg',
      created_at: new Date().toISOString(),
      user: { id: 'user-me', full_name: 'Test User', handle: 'tester', avatar_url: null },
      client_message_id: 'cm-flush-1',
    });

    const delivered: string[] = [];
    offFlush = registerOfflineFlushListener((m) =>
      delivered.push(m?.client_message_id ?? ''),
    );

    await act(async () => {
      await flushOfflineQueue();
    });

    // The replay carried the ORIGINAL clientMessageId (server-side dedupe key).
    // (mock.calls also holds the mount-time history GET — filter to POSTs.)
    const posts = mockFetcher.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(posts).toHaveLength(1);
    const [url, init] = posts[0] as [string, RequestInit];
    expect(url).toBe('/matches/m1/messages');
    expect(JSON.parse(String(init.body))).toEqual({
      content: 'queued msg',
      clientMessageId: 'cm-flush-1',
    });
    // Entry discarded + listener notified → open sheet flips queued → sent.
    expect(result.current.queuedCount).toBe(0);
    expect(delivered).toEqual(['cm-flush-1']);
    await waitFor(() =>
      expect(
        result.current.messages.find((m) => m.client_message_id === 'cm-flush-1')?.status,
      ).toBe('sent'),
    );
    expect(
      JSON.parse(window.localStorage.getItem('kl.offlineChatQueue.v1') ?? '[]'),
    ).toEqual([]);
  });

  it('keeps the entry queued when the flush fails (still unreachable)', async () => {
    setOnline(false);
    const { result } = await mountChat();
    act(() => {
      result.current.sendMessage.mutate({
        content: 'still down',
        clientMessageId: 'cm-fail-1',
      });
    });
    await waitFor(() => expect(result.current.queuedCount).toBe(1));

    // Install the failing mock BEFORE going online: the `online` event makes
    // the watcher auto-flush immediately — with the bare mock it would
    // "succeed" (undefined → fabricated delivery) and drain the queue.
    mockFetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/messages/read')) {
        return Promise.resolve({ ok: true });
      }
      if (init?.method === 'POST') {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      return Promise.resolve([]);
    });
    setOnline(true);
    // EVERY send POST fails (server still unreachable) — both the watcher's
    // auto-flush and the manual flush below.

    await act(async () => {
      await flushOfflineQueue();
    });

    // The entry STAYS queued (retry backlog), and the open sheet's bubble
    // flips to `failed` (red + tap-to-retry) — never a stuck spinner.
    expect(result.current.queuedCount).toBe(1);
    await waitFor(() =>
      expect(
        result.current.messages.find((m) => m.client_message_id === 'cm-fail-1')?.status,
      ).toBe('failed'),
    );
    expect(
      JSON.parse(window.localStorage.getItem('kl.offlineChatQueue.v1') ?? '[]'),
    ).toHaveLength(1);
  });

  it('backfills a PREVIOUS-session queued entry into a fresh sheet as `queued`', async () => {
    // Simulate a page closed while a message was parked.
    window.localStorage.setItem(
      'kl.offlineChatQueue.v1',
      JSON.stringify([
        {
          matchId: 'm1',
          content: 'from last session',
          clientMessageId: 'cm-prev-1',
          queuedAt: new Date().toISOString(),
          userId: 'user-me',
        },
      ]),
    );

    const { result } = await mountChat();
    const backfilled = result.current.messages.find(
      (m) => m.client_message_id === 'cm-prev-1',
    );
    expect(backfilled?.status).toBe('queued');
    expect(backfilled?.content).toBe('from last session');
    expect(result.current.queuedCount).toBe(1);
  });

  it('a flush replays ONLY the current account entries and leaves others parked (cross-account guard)', async () => {
    // Two accounts queued while offline; user-me is logged in now.
    window.localStorage.setItem(
      'kl.offlineChatQueue.v1',
      JSON.stringify([
        {
          matchId: 'm1',
          content: 'mine',
          clientMessageId: 'cm-mine-1',
          queuedAt: new Date().toISOString(),
          userId: 'user-me',
        },
        {
          matchId: 'm1',
          content: 'someone else wrote this on a shared device',
          clientMessageId: 'cm-other-1',
          queuedAt: new Date().toISOString(),
          userId: 'user-other',
        },
      ]),
    );
    const sentBodies: string[] = [];
    mockFetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/messages/read')) {
        return Promise.resolve({ ok: true });
      }
      if (init?.method === 'POST') {
        sentBodies.push(String(init.body));
        const body = JSON.parse(String(init.body)) as { clientMessageId: string };
        return Promise.resolve({
          id: `srv-${body.clientMessageId}`,
          match_id: 'm1',
          user_id: 'user-me',
          content: 'echo',
          created_at: new Date().toISOString(),
          user: { id: 'user-me', full_name: 'Test User', handle: 'tester', avatar_url: null },
          client_message_id: body.clientMessageId,
        });
      }
      return Promise.resolve([]);
    });

    await act(async () => {
      await flushOfflineQueue();
    });

    // Exactly ONE send POST fired — the current account's entry.
    const sendPosts = sentBodies.filter((b) => !b.includes('messages/read'));
    expect(sendPosts).toHaveLength(1);
    expect(JSON.parse(sendPosts[0]).clientMessageId).toBe('cm-mine-1');
    // The foreign entry was NOT delivered — it stays parked untouched.
    const stored = JSON.parse(
      window.localStorage.getItem('kl.offlineChatQueue.v1') ?? '[]',
    ) as Array<{ clientMessageId: string }>;
    expect(stored.map((e) => e.clientMessageId)).toEqual(['cm-other-1']);
  });

  it('an ONLINE send bypasses the queue entirely and still works', async () => {
    // Socket disconnected → the send takes the REST fallback (deterministic
    // in tests; a connected socket would wait for a WS echo we never fire).
    mockConnected = false;
    // Route by URL: history GET → [], read-mark POST → {ok}, send POST →
    // the created message. (mockResolvedValueOnce would be consumed by the
    // mount-time history call before the send fires.)
    mockFetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/messages/read')) {
        return Promise.resolve({ ok: true });
      }
      if (init?.method === 'POST') {
        return Promise.resolve({
          id: 'srv-online',
          match_id: 'm1',
          user_id: 'user-me',
          content: 'online msg',
          created_at: new Date().toISOString(),
          user: { id: 'user-me', full_name: 'Test User', handle: 'tester', avatar_url: null },
          client_message_id: 'cm-on-1',
        });
      }
      return Promise.resolve([]);
    });
    const { result } = await mountChat();
    act(() => {
      result.current.sendMessage.mutate({
        content: 'online msg',
        clientMessageId: 'cm-on-1',
      });
    });
    await waitFor(() =>
      expect(
        result.current.messages.find((m) => m.client_message_id === 'cm-on-1')?.status,
      ).toBe('sent'),
    );
    expect(result.current.queuedCount).toBe(0);
  });

  // ── Run #145 hardening (Reviewer A findings on #144) ─────────────────────

  it('prunes TTL-expired entries (7d) and keeps fresh ones', async () => {
    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(now - 60 * 1000).toISOString();
    window.localStorage.setItem(
      'kl.offlineChatQueue.v1',
      JSON.stringify([
        {
          matchId: 'm1',
          content: 'ancient',
          clientMessageId: 'cm-old-1',
          queuedAt: eightDaysAgo,
          userId: 'user-me',
        },
        {
          matchId: 'm1',
          content: 'fresh',
          clientMessageId: 'cm-new-1',
          queuedAt: fresh,
          userId: 'user-me',
        },
      ]),
    );
    const { result } = await mountChat();
    // The expired entry never backfills; the fresh one does.
    expect(
      result.current.messages.some((m) => m.client_message_id === 'cm-old-1'),
    ).toBe(false);
    expect(
      result.current.messages.find((m) => m.client_message_id === 'cm-new-1')?.status,
    ).toBe('queued');
    expect(result.current.queuedCount).toBe(1);
    // The next persist rewrites storage without the expired entry.
    const stored = JSON.parse(
      window.localStorage.getItem('kl.offlineChatQueue.v1') ?? '[]',
    ) as Array<{ clientMessageId: string }>;
    expect(stored.map((e) => e.clientMessageId)).toEqual(['cm-new-1']);
  });

  it('caps the backlog at 50 entries, dropping the OLDEST', async () => {
    const now = Date.now();
    const entries = Array.from({ length: 60 }, (_, i) => ({
      matchId: 'm1',
      content: `msg-${i}`,
      clientMessageId: `cm-cap-${i}`,
      // Strictly increasing timestamps → oldest first in storage order.
      queuedAt: new Date(now - (1000 - i) * 1000).toISOString(),
      userId: 'user-me',
    }));
    window.localStorage.setItem('kl.offlineChatQueue.v1', JSON.stringify(entries));

    // Route by URL (pitfall rule): history GET → [], read-mark POST → {ok},
    // send POST (offline → never fires, but reject loudly if it does).
    mockFetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/messages/read')) {
        return Promise.resolve({ ok: true });
      }
      if (init?.method === 'POST') {
        return Promise.reject(new Error('offline send must not hit the wire'));
      }
      return Promise.resolve([]);
    });

    // A read (via mount) prunes; then one MORE enqueue must push the count
    // over the cap and drop the oldest entries, keeping the newest 50.
    // (Offline BEFORE mount — the proven test-1 shape; the enqueue-time cap
    // is what's under test, not the online→offline transition.)
    setOnline(false);
    const { result } = await mountChat();
    expect(result.current.queuedCount).toBe(50); // already capped by prune

    act(() => {
      result.current.sendMessage.mutate({
        content: 'overflow entry',
        clientMessageId: 'cm-cap-new',
      });
    });
    await waitFor(() =>
      expect(
        result.current.messages.find((m) => m.client_message_id === 'cm-cap-new')
          ?.status,
      ).toBe('queued'),
    );
    const stored = JSON.parse(
      window.localStorage.getItem('kl.offlineChatQueue.v1') ?? '[]',
    ) as Array<{ clientMessageId: string }>;
    expect(stored).toHaveLength(50);
    // Oldest dropped, newest kept (the incoming entry is the last).
    expect(stored.some((e) => e.clientMessageId === 'cm-cap-0')).toBe(false);
    expect(stored[49]?.clientMessageId).toBe('cm-cap-new');
  });

  it('an offline send with NO logged-in user fails loudly instead of parking an orphan', async () => {
    const store = (await import('@/store/useAppStore')) as unknown as {
      __setActiveUser: (u: null | undefined) => void;
    };
    // Route by URL (pitfall rule) BEFORE mounting: the mount-time history GET
    // must resolve or React Query wedges the render and onError never lands.
    mockFetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/messages/read')) {
        return Promise.resolve({ ok: true });
      }
      if (init?.method === 'POST') {
        return Promise.reject(new Error('orphan send must not hit the wire'));
      }
      return Promise.resolve([]);
    });
    store.__setActiveUser(null);
    // Offline BEFORE mount — the proven test-1 shape; the guard is what's
    // under test, not the online→offline transition.
    setOnline(false);
    try {
      const { result } = await mountChat();
      act(() => {
        result.current.sendMessage.mutate({
          content: 'orphan send',
          clientMessageId: 'cm-orphan-1',
        });
      });
      await waitFor(() =>
        expect(
          result.current.messages.find((m) => m.client_message_id === 'cm-orphan-1')
            ?.status,
        ).toBe('failed'),
      );
      // Nothing parked: storage stays empty; no flush will ever pick it up.
      expect(
        JSON.parse(window.localStorage.getItem('kl.offlineChatQueue.v1') ?? '[]'),
      ).toEqual([]);
      expect(result.current.queuedCount).toBe(0);
    } finally {
      store.__setActiveUser(undefined); // restore user-me for later cases
    }
  });

  // P2-226: a PERMANENTLY-rejected replay (4xx except 408/429) is RETIRED
  // from the queue so the watcher poll stops re-POSTing it; transient
  // failures (network TypeError, 408, 429, 5xx) stay parked.
  describe('terminal-error retirement (P2-226)', () => {
    function parkChatEntry(clientMessageId: string, content: string) {
      window.localStorage.setItem(
        'kl.offlineChatQueue.v1',
        JSON.stringify([
          {
            matchId: 'm1',
            content,
            clientMessageId,
            queuedAt: new Date().toISOString(),
            userId: 'user-me',
          },
        ]),
      );
    }

    function rejectPostsWith(err: unknown) {
      mockFetcher.mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && String(url).endsWith('/messages/read')) {
          return Promise.resolve({ ok: true });
        }
        if (init?.method === 'POST') return Promise.reject(err);
        return Promise.resolve([]);
      });
    }

    function sendPostCount(): number {
      return mockFetcher.mock.calls.filter(
        ([url, init]) =>
          (init as RequestInit | undefined)?.method === 'POST' &&
          String(url) === '/matches/m1/messages',
      ).length;
    }

    function storedQueue(): unknown[] {
      return JSON.parse(window.localStorage.getItem('kl.offlineChatQueue.v1') ?? '[]');
    }

    it.each([
      [404, 'chat gone'],
      [403, 'forbidden'],
    ])('retires the entry on %i (%s) and never re-POSTs it on the next cycle', async (status) => {
      parkChatEntry('cm-term', 'doomed');
      rejectPostsWith(new FetchError('rejected', status, '/matches/m1/messages'));
      const failures: Array<{ id: string; terminal?: boolean }> = [];
      offFlush = registerOfflineFlushListener((message, failedEntry, terminal) => {
        if (failedEntry) failures.push({ id: failedEntry.clientMessageId, terminal });
      });

      await act(async () => {
        await flushOfflineQueue();
      });
      expect(sendPostCount()).toBe(1);
      expect(storedQueue()).toEqual([]);
      expect(failures).toEqual([{ id: 'cm-term', terminal: true }]);

      // Next watcher cycle: nothing left to replay.
      await act(async () => {
        await flushOfflineQueue();
      });
      expect(sendPostCount()).toBe(1);
    });

    it.each([
      ['408 timeout', () => new FetchError('timeout', 408, '/x')],
      ['429 rate limit', () => new FetchError('slow down', 429, '/x')],
      ['503 server error', () => new FetchError('unavailable', 503, '/x')],
      ['network TypeError', () => new TypeError('Failed to fetch')],
    ])('keeps the entry queued on a transient %s and retries next cycle', async (_label, makeErr) => {
      parkChatEntry('cm-transient', 'retry me');
      rejectPostsWith(makeErr());
      const failures: Array<{ id: string; terminal?: boolean }> = [];
      offFlush = registerOfflineFlushListener((message, failedEntry, terminal) => {
        if (failedEntry) failures.push({ id: failedEntry.clientMessageId, terminal });
      });

      await act(async () => {
        await flushOfflineQueue();
      });
      expect(storedQueue()).toHaveLength(1);
      expect(failures).toEqual([{ id: 'cm-transient', terminal: undefined }]);

      await act(async () => {
        await flushOfflineQueue();
      });
      expect(sendPostCount()).toBe(2);
      expect(storedQueue()).toHaveLength(1);
    });

    it('a retired backfilled entry stays visible in the open sheet as `failed`', async () => {
      parkChatEntry('cm-term-ui', 'closed chat');
      rejectPostsWith(new FetchError('not found', 404, '/matches/m1/messages'));
      // Block auto-flush until the sheet has rendered the backfill.
      setOnline(false);
      const { result } = await mountChat();
      expect(
        result.current.messages.find((m) => m.client_message_id === 'cm-term-ui')?.status,
      ).toBe('queued');
      setOnline(true);

      await act(async () => {
        await flushOfflineQueue();
      });

      await waitFor(() =>
        expect(
          result.current.messages.find((m) => m.client_message_id === 'cm-term-ui')?.status,
        ).toBe('failed'),
      );
      expect(result.current.queuedCount).toBe(0);
      expect(storedQueue()).toEqual([]);
    });
  });
});
