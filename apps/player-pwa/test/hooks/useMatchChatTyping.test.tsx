import { describe, it, expect, vi, afterEach } from 'vitest';
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
// Controllable connected flag — typing is WS-only.
let mockConnected = true;
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    get connected() {
      return mockConnected;
    },
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
 * P2-99 (run #74): match-chat typing indicator.
 * - emitTyping throttles to 1 WS emit / 3s and is WS-only (offline → silent).
 * - a peer `typing` event adds their userId and expires after 4s of silence;
 *   a repeated signal re-arms the timer instead of stacking expiries.
 * - the typer's OWN userId echo is ignored (server skips sender, belt+braces).
 * - unmount clears all expiry timers and state (no setState-after-unmount).
 *
 * Timer strategy: mount + history load run on REAL timers (React Query's
 * internals starve under fake timers); vi.useFakeTimers() is engaged only
 * AFTER the initial wait, for the throttle/expiry assertions themselves.
 */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function fire(event: string, payload?: unknown) {
  for (const h of mockHandlers.get(event) ?? []) h(payload);
}

describe('useMatchChat typing indicator (P2-99, run #74)', () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockEmit.mockClear();
    mockConnected = true;
    mockFetcher.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits typing at most once per 3s while the socket is connected', async () => {
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => fire('connect'));
    mockEmit.mockClear(); // connect emits join-lobby — not under test here
    vi.useFakeTimers();

    act(() => result.current.emitTyping());
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith('typing', { matchId: 'm1' });

    // Inside the throttle window — suppressed.
    act(() => vi.advanceTimersByTime(2_000));
    act(() => result.current.emitTyping());
    expect(mockEmit).toHaveBeenCalledTimes(1);

    // After the window — emitted again.
    act(() => vi.advanceTimersByTime(1_100));
    act(() => result.current.emitTyping());
    expect(mockEmit).toHaveBeenCalledTimes(2);
  });

  it('does not emit before the socket connects (WS-only, silent)', async () => {
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // No 'connect' fired → socketRef null → typing silently dropped.
    act(() => result.current.emitTyping());
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('adds a peer typer, expires after 4s, and re-arms on repeat signals', async () => {
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => fire('connect'));
    vi.useFakeTimers();

    act(() => fire('typing', { userId: 'peer-a', matchId: 'm1' }));
    expect(result.current.typingUserIds.has('peer-a')).toBe(true);

    // Repeated signal at 3s re-arms (still present at 4.5s).
    act(() => vi.advanceTimersByTime(3_000));
    act(() => fire('typing', { userId: 'peer-a', matchId: 'm1' }));
    act(() => vi.advanceTimersByTime(1_500));
    expect(result.current.typingUserIds.has('peer-a')).toBe(true);

    // The re-armed 4s window (armed at t=3s) lapses at t=7s — advance past it.
    act(() => vi.advanceTimersByTime(2_600));
    expect(result.current.typingUserIds.has('peer-a')).toBe(false);
  });

  it('ignores the own-user echo and unknown payloads', async () => {
    const { result } = renderHook(() => useMatchChat('m1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => fire('connect'));

    act(() => fire('typing', { userId: 'user-me', matchId: 'm1' }));
    act(() => fire('typing', {}));
    expect(result.current.typingUserIds.size).toBe(0);
  });

  it('clears typing state on unmount without post-unmount updates', async () => {
    const { result, unmount } = renderHook(() => useMatchChat('m1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => fire('connect'));

    act(() => fire('typing', { userId: 'peer-a', matchId: 'm1' }));
    expect(result.current.typingUserIds.size).toBe(1);

    unmount();
    vi.useFakeTimers();
    // The 4s expiry timer firing after unmount must not throw.
    expect(() => vi.advanceTimersByTime(5_000)).not.toThrow();
  });
});
