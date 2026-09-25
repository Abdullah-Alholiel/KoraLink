import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeClient } from '@/lib/realtime';
import { captureError } from '@/providers/ObservabilityProvider';

vi.mock('@/providers/ObservabilityProvider', () => ({
  captureError: vi.fn(),
  trackEvent: vi.fn(),
}));

/**
 * Slice 2 regression tests: the shared realtime client (one socket per
 * session, ref-counted rooms, singleton reuse, handler isolation).
 */

type EmitLog = Array<{ event: string; payload: unknown }>;

/** Minimal socket.io-client stub standing in for the real transport. */
function makeFakeSocket() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitted: EmitLog = [];
  const anyListeners: Array<(event: string, ...args: unknown[]) => void> = [];

  const socket = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(cb);
      return socket;
    }),
    onAny: vi.fn((cb: (event: string, ...args: unknown[]) => void) => {
      anyListeners.push(cb);
      return socket;
    }),
    emit: vi.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload });
      return true;
    }),
    disconnect: vi.fn(),
    connected: true,
    /** Test helper: simulate a server-pushed event. */
    __serverEvent(event: string, payload: unknown) {
      for (const cb of anyListeners) cb(event, payload);
    },
    /** Test helper: simulate a socket lifecycle event. */
    __lifecycle(event: string, ...args: unknown[]) {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
    __emitted: emitted,
  };
  return socket;
}

type FakeSocket = ReturnType<typeof makeFakeSocket>;

function setup(singleton: RealtimeClient, socket: FakeSocket) {
  singleton.setSocketFactory(() => socket as never);
}

describe('RealtimeClient (Slice 2 singleton)', () => {
  let singleton: RealtimeClient;
  let socket: FakeSocket;

  beforeEach(() => {
    singleton = new RealtimeClient();
    socket = makeFakeSocket();
    setup(singleton, socket);
  });

  it('destroys the transport only when the last consumer leaves', () => {
    let created = 0;
    const sockets: FakeSocket[] = [];
    singleton.setSocketFactory(() => {
      const s = makeFakeSocket();
      sockets.push(s);
      created += 1;
      return s as never;
    });

    singleton.connect(); // consumer A
    singleton.connect(); // consumer B
    singleton.disconnect(); // A leaves — B still holds
    expect(sockets[0].disconnect).not.toHaveBeenCalled();

    singleton.disconnect(); // B leaves — last one
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(created).toBe(1);

    singleton.connect(); // fresh session
    expect(created).toBe(2);
  });

  it('churn never double-destroys and leaves a live transport at the end', () => {
    singleton.connect();
    singleton.disconnect(); // destroy #1 (last consumer)
    singleton.connect(); // re-create
    singleton.connect();
    singleton.disconnect(); // still one consumer left — NO destroy

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(singleton.isConnected()).toBe(true);
  });

  it('emits join-lobby on first room ref, leaves only on last', () => {
    singleton.connect();
    singleton.joinRoom('match', 'm1');
    singleton.joinRoom('match', 'm1'); // second viewer of the same match
    expect(socket.__emitted.filter((e) => e.event === 'join-lobby')).toHaveLength(1);

    singleton.leaveRoom('match', 'm1'); // first viewer unmounts
    expect(socket.__emitted.filter((e) => e.event === 'leave-lobby')).toHaveLength(0);

    singleton.leaveRoom('match', 'm1'); // last viewer unmounts
    expect(socket.__emitted.filter((e) => e.event === 'leave-lobby')).toHaveLength(1);
  });

  it('re-joins every ref-counted room on reconnect (server rooms are per-connection)', () => {
    singleton.connect();
    singleton.joinRoom('match', 'm1');
    singleton.joinRoom('conversation', 'c1');
    socket.__emitted.length = 0;

    socket.__lifecycle('connect');
    const joinEvents = socket.__emitted.map((e) => e.event);
    expect(joinEvents).toContain('join-lobby');
    expect(joinEvents).toContain('join-conversation');
  });

  it('fans each server event out to every subscriber exactly once', () => {
    singleton.connect();
    const a = vi.fn();
    const b = vi.fn();
    singleton.on('new-message', a);
    singleton.on('new-message', b);
    singleton.on('other', a);

    socket.__serverEvent('new-message', { id: 'x' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith({ id: 'x' });
  });

  it('one throwing subscriber never breaks the others (fan-out isolation)', () => {
    singleton.connect();
    const boom = vi.fn(() => {
      throw new Error('bad subscriber');
    });
    const good = vi.fn();
    singleton.on('new-dm', boom);
    singleton.on('new-dm', good);
    const captureSpy = vi.mocked(captureError);

    expect(() => socket.__serverEvent('new-dm', { id: 'y' })).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalled();
  });

  it('unsubscribing removes exactly one registration (distinct fns)', () => {
    singleton.connect();
    const a = vi.fn();
    const a2 = vi.fn(); // same behavior, different identity
    const off = singleton.on('notification', a);
    singleton.on('notification', a2);
    off();
    socket.__serverEvent('notification', { verb: 'followed' });
    expect(a).not.toHaveBeenCalled();
    expect(a2).toHaveBeenCalledTimes(1);
  });

  it('emits are silent no-ops while disconnected', () => {
    // Never connected → no transport → emit must not throw.
    expect(() => singleton.emit('mark-chat-read', { matchId: 'm1' })).not.toThrow();
    expect(socket.__emitted).toHaveLength(0);
  });

  it('isConnected reflects the live transport, not just consumer count', () => {
    expect(singleton.isConnected()).toBe(false);
    singleton.connect();
    expect(singleton.isConnected()).toBe(true);
    singleton.disconnect();
    expect(singleton.isConnected()).toBe(false);
  });

  it('teardown clears roomRefs — a later connect() does not re-emit stale joins', () => {
    // Slice 2 review regression: teardown (logout / hard reset) must drop
    // every room ref, or the next session resurrects joins for rooms the
    // user no longer holds.
    singleton.connect();
    singleton.joinRoom('match', 'm1');
    singleton.joinRoom('conversation', 'c1');
    singleton.teardown();

    singleton.connect(); // fresh session, same client instance
    socket.__emitted.length = 0;
    socket.__lifecycle('connect');
    expect(socket.__emitted.filter((e) => e.event === 'join-lobby')).toHaveLength(0);
    expect(socket.__emitted.filter((e) => e.event === 'join-conversation')).toHaveLength(0);
  });
});
