import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useConversationMessages } from '@/hooks/useConversations';
import { useAppStore } from '@/store/useAppStore';
import { fetcher, FetchError } from '@/lib/fetcher';
import { createLobbySocket } from '@/lib/socket';

vi.mock('@/lib/fetcher', () => ({
  fetcher: vi.fn(),
  FetchError: class FetchError extends Error {},
}));

vi.mock('@/lib/socket', () => ({
  createLobbySocket: vi.fn(),
}));

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Minimal socket double: records emissions, replays registered handlers.
function makeSocketStub() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const emitted: { event: string; payload: unknown }[] = [];
  const socket = {
    connected: true,
    on: vi.fn((event: string, cb: (payload: unknown) => void) => {
      handlers.set(event, cb);
      // Simulate an already-open connection: 'connect' fires on registration.
      if (event === 'connect') cb(undefined);
    }),
    emit: vi.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload });
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    __emitToSelf: (event: string, payload: unknown) => handlers.get(event)?.(payload),
  };
  return { socket, emitted, handlers };
}

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
  queryClient.setQueryData(['conversations'], {
    pages: [
      {
        items: [
          { id: 'conv-1', unreadCount: 3, lastMessage: 'hi from other' },
          { id: 'conv-2', unreadCount: 1 },
        ],
      },
    ],
    pageParams: [null],
  });
  queryClient.setQueryData(['user', 'me', 'discussions'], [
    { id: 'conv-1', type: 'personal', unreadCount: 3 },
    { id: 'conv-9', type: 'match', unreadCount: 2 },
  ]);
}

describe('useConversationMessages — read receipts (seen state)', () => {
  let sock: ReturnType<typeof makeSocketStub>;

  beforeEach(() => {
    vi.mocked(fetcher).mockReset();
    vi.mocked(createLobbySocket).mockReset();
    sock = makeSocketStub();
    vi.mocked(createLobbySocket).mockReturnValue(sock.socket as never);
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
      sock.handlers.get('new-dm')?.(OTHER_MESSAGE);
    });

    await waitFor(() => {
      const markRead = sock.emitted.find((e) => e.event === 'mark-read');
      expect(markRead).toBeDefined();
    });

    // Both caches zeroed for conv-1 only.
    const convCache = queryClient.getQueryData<{ pages: { items: { id: string; unreadCount: number }[] }[] }>(['conversations']);
    expect(convCache?.pages[0].items.find((c) => c.id === 'conv-1')?.unreadCount).toBe(0);
    expect(convCache?.pages[0].items.find((c) => c.id === 'conv-2')?.unreadCount).toBe(1);
    const discussions = queryClient.getQueryData<{ id: string; unreadCount: number }[]>(['user', 'me', 'discussions']);
    expect(discussions?.find((d) => d.id === 'conv-1')?.unreadCount).toBe(0);
    expect(discussions?.find((d) => d.id === 'conv-9')?.unreadCount).toBe(2);

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
    await waitFor(() => expect(createLobbySocket).toHaveBeenCalled());

    unmount();

    const markReads = sock.emitted.filter((e) => e.event === 'mark-read');
    expect(markReads.length).toBeGreaterThanOrEqual(1);
    expect(markReads.at(-1)?.payload).toEqual({ conversationId: 'conv-1' });

    // Leaving zeroes the stale badge in both caches.
    const convCache = queryClient.getQueryData<{ pages: { items: { id: string; unreadCount: number }[] }[] }>(['conversations']);
    expect(convCache?.pages[0].items.find((c) => c.id === 'conv-1')?.unreadCount).toBe(0);
    const discussions = queryClient.getQueryData<{ id: string; unreadCount: number }[]>(['user', 'me', 'discussions']);
    expect(discussions?.find((d) => d.id === 'conv-1')?.unreadCount).toBe(0);
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
    await waitFor(() => expect(createLobbySocket).toHaveBeenCalled());

    // My OWN message echoing back must not trigger read marking.
    act(() => {
      sock.handlers.get('new-dm')?.({
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
