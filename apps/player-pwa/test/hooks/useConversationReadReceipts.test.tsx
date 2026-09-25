import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useConversationMessages } from '@/hooks/useConversations';
import { useAppStore } from '@/store/useAppStore';
import { fetcher, FetchError } from '@/lib/fetcher';
import { getRealtime } from '@/lib/realtime';

vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Minimal transport double injected through the RealtimeClient seam
// (Slice 2). Server events are fired through the onAny bridge — the same
// path the real socket.io-client transport uses.
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

const OTHER_MESSAGE = {
  id: 'msg-from-other',
  conversationId: 'conv-1',
  sender: { id: 'user-other', fullName: 'Other', handle: 'other', avatarUrl: '' },
  content: 'hi from other',
  createdAt: new Date().toISOString(),
  clientMessageId: null,
};

const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

function seedCaches(queryClient: QueryClient) {
  // Real cache shapes (2026-09-22 pagination refactor):
  // - ['conversations', 'infinite'] — InfiniteData<{conversations, total, hasMore}>
  // - ['user','me','discussions']  — InfiniteData<{discussions, total, hasMore}> (raw envelope)
  queryClient.setQueryData(['conversations', 'infinite'], {
    pages: [
      {
        conversations: [
          { id: 'conv-1', unreadCount: 3, lastMessage: 'hi from other' },
          { id: 'conv-2', unreadCount: 1 },
        ],
        total: 2,
        hasMore: false,
      },
    ],
    pageParams: [1],
  });
  queryClient.setQueryData(['user', 'me', 'discussions'], {
    pages: [
      {
        discussions: [
          { id: 'conv-1', type: 'personal', unreadCount: 3 },
          { id: 'conv-9', type: 'match', unreadCount: 2 },
        ],
        total: 2,
        hasMore: false,
      },
    ],
    pageParams: [1],
  });
}

describe('useConversationMessages — read receipts (seen state)', () => {
  beforeEach(() => {
    vi.mocked(fetcher).mockReset();
    // Fresh singleton per test; inject the controllable stub transport.
    const rt = getRealtime();
    rt.teardown();
    sock = makeSocketStub();
    rt.setSocketFactory(() => sock.socket as never);
    // The read-receipt guard keys off the current user's id.
    useAppStore.setState({
      user: {
        id: 'user-me',
        fullName: 'Me',
        handle: 'me',
        avatarUrl: '',
        phone: '+966500000001',
      } as never,
    });
  });

  it('emits mark-read when a message from the OTHER user arrives while open, and zeroes both cached unread counts', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    seedCaches(queryClient);
    vi.mocked(fetcher).mockResolvedValue([]);

    const { result, unmount } = renderHook(
      () => useConversationMessages('conv-1'),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.messages.length).toBe(0)); // history loaded

    // The other user sends a message while the thread is open.
    act(() => {
      sock.socket.__fireServerEvent('new-dm', OTHER_MESSAGE);
    });

    await waitFor(() => {
      const markRead = sock.emitted.find((e) => e.event === 'mark-read');
      expect(markRead).toBeDefined();
    });

    // Both caches zeroed for conv-1 only (infinite-envelope shapes).
    const convCache = queryClient.getQueryData<{
      pages: { conversations: { id: string; unreadCount: number }[] }[];
    }>(['conversations', 'infinite']);
    expect(convCache?.pages[0].conversations.find((c) => c.id === 'conv-1')?.unreadCount).toBe(0);
    expect(convCache?.pages[0].conversations.find((c) => c.id === 'conv-2')?.unreadCount).toBe(1);
    const discussions = queryClient.getQueryData<{
      pages: { discussions: { id: string; unreadCount: number }[] }[];
    }>(['user', 'me', 'discussions']);
    expect(discussions?.pages[0].discussions.find((d) => d.id === 'conv-1')?.unreadCount).toBe(0);
    expect(discussions?.pages[0].discussions.find((d) => d.id === 'conv-9')?.unreadCount).toBe(2);

    unmount();
  });

  it('emits mark-read on unmount so leaving the thread persists the seen state', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    seedCaches(queryClient);
    vi.mocked(fetcher).mockResolvedValue([]);

    const { unmount } = renderHook(() => useConversationMessages('conv-1'), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(getRealtime().isConnected()).toBe(true));

    unmount();

    const markReads = sock.emitted.filter((e) => e.event === 'mark-read');
    expect(markReads.length).toBeGreaterThanOrEqual(1);
    expect(markReads.at(-1)?.payload).toEqual({ conversationId: 'conv-1' });

    // Leaving zeroes the stale badge in both caches (infinite-envelope shapes).
    const convCache = queryClient.getQueryData<{
      pages: { conversations: { id: string; unreadCount: number }[] }[];
    }>(['conversations', 'infinite']);
    expect(convCache?.pages[0].conversations.find((c) => c.id === 'conv-1')?.unreadCount).toBe(0);
    const discussions = queryClient.getQueryData<{
      pages: { discussions: { id: string; unreadCount: number }[] }[];
    }>(['user', 'me', 'discussions']);
    expect(discussions?.pages[0].discussions.find((d) => d.id === 'conv-1')?.unreadCount).toBe(0);
  });

  it('does NOT emit mark-read when nothing new arrived and never flags my own messages', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    seedCaches(queryClient);
    vi.mocked(fetcher).mockResolvedValue([]);

    const { result, unmount } = renderHook(
      () => useConversationMessages('conv-1'),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => expect(getRealtime().isConnected()).toBe(true));

    // My OWN message echoing back must not trigger read marking.
    act(() => {
      sock.socket.__fireServerEvent('new-dm', {
        ...OTHER_MESSAGE,
        id: 'mine-1',
        sender: { id: 'user-me', fullName: 'Me', handle: 'me', avatarUrl: '' },
      });
    });
    await waitFor(() => expect(result.current.messages.some((m) => m.id === 'mine-1')).toBe(true));

    const markReadsBefore = sock.emitted.filter((e) => e.event === 'mark-read');
    expect(markReadsBefore).toHaveLength(0);

    unmount();
    // Only the unmount-time mark-read fires (persisting the seen state).
    const markReads = sock.emitted.filter((e) => e.event === 'mark-read');
    expect(markReads).toHaveLength(1);
  });
});
