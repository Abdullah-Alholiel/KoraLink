import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { socketBaseUrl, LOBBY_NAMESPACE, TOKEN_STORAGE_KEY } from '@/lib/socket';
import { captureError } from '@/providers/ObservabilityProvider';

/**
 * Shared /lobby realtime client (Slice 2, 2026-09-22 data-streamlining review §B1).
 *
 * ONE WebSocket per app session instead of up to four: every previous call
 * site (`NotificationProvider`, `useMatch`, `useMatchChat`,
 * `useConversationMessages`, `PostMatchSection`) created its own connection,
 * each paying a full authenticated handshake (JWT verify + users-row SELECT)
 * and battery cost.
 *
 * Semantics preserved from the per-hook sockets:
 * - Rooms are REF-COUNTED and (re)joined on every `connect` — server rooms
 *   are per-connection, so a reconnect must re-join.
 * - Rooms are LEFT when the last consumer unmounts (`leave-lobby` /
 *   `leave-conversation`). The server's chat-notify fan-out treats room
 *   membership as "currently viewing": a stale room member silently stops
 *   receiving bell/push notifications for that chat.
 * - `connect`/`disconnect`/`connect_error` fan out to subscribers, so
 *   consumers keep their isConnected UI state.
 * - Handler exceptions are isolated — one bad subscriber cannot break the
 *   fan-out to the others.
 *
 * Lifecycle: `connect()`/`disconnect()` are ref-counted. At zero consumers
 * the socket is destroyed (and the token re-read on the next `connect()` —
 * logout hard-navigates, but a same-tab re-login also gets a fresh socket).
 */
export type RoomKind = 'match' | 'conversation';
type Payload = unknown;
type Handler = (payload: Payload) => void;

const RECONNECT_DELAY_MS = 1000;

export class RealtimeClient {
  private socket: Socket | null = null;
  private consumers = 0;
  private handlers = new Map<string, Set<Handler>>();
  /** `${kind}:${id}` → consumer refcount. */
  private roomRefs = new Map<string, number>();
  /** Test seam — see createSocket(). */
  private socketFactory:
    | ((url: string, opts: Record<string, unknown>) => Socket)
    | null = null;

  /** Tests only: replace the real socket.io transport with a stub. */
  setSocketFactory(factory: RealtimeClient['socketFactory']): void {
    this.socketFactory = factory;
  }

  /** Acquire: bump the consumer count and ensure the socket exists. */
  connect(): void {
    this.consumers += 1;
    if (!this.socket) this.createSocket();
  }

  /** Release: at zero consumers the socket is torn down. */
  disconnect(): void {
    this.consumers = Math.max(0, this.consumers - 1);
    if (this.consumers === 0) this.destroy();
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Subscribe; returns the unsubscribe function. Caller types the payload. */
  on<T = unknown>(event: string, handler: (payload: T) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler);
    return () => {
      set.delete(handler as Handler);
    };
  }

  /** Emit on the shared socket (no-op while disconnected). */
  emit(event: string, payload?: Payload): void {
    this.socket?.emit(event, payload);
  }

  /**
   * Join a server room for this consumer. The FIRST ref emits the join
   * immediately (if connected) — later connects re-join automatically.
   * Joining twice is idempotent server-side.
   */
  joinRoom(kind: RoomKind, id: string): void {
    const key = `${kind}:${id}`;
    const next = (this.roomRefs.get(key) ?? 0) + 1;
    this.roomRefs.set(key, next);
    if (next === 1) this.emitJoin(kind, id);
  }

  /**
   * Leave a room when this consumer unmounts. At the LAST ref the client
   * tells the server — `leave-conversation` (existing handler) or
   * `leave-lobby` (added alongside this refactor) — so "currently viewing"
   * semantics stay exact.
   */
  leaveRoom(kind: RoomKind, id: string): void {
    const key = `${kind}:${id}`;
    const next = (this.roomRefs.get(key) ?? 0) - 1;
    if (next > 0) {
      this.roomRefs.set(key, next);
      return;
    }
    this.roomRefs.delete(key);
    if (kind === 'match') this.socket?.emit('leave-lobby', { matchId: id });
    else this.socket?.emit('leave-conversation', { conversationId: id });
  }

  /** Tests and hard resets only — drops every handler and room ref. */
  teardown(): void {
    this.destroy();
    this.handlers.clear();
    this.consumers = 0;
  }

  private emitJoin(kind: RoomKind, id: string): void {
    if (kind === 'match') this.socket?.emit('join-lobby', { matchId: id });
    else this.socket?.emit('join-conversation', { conversationId: id });
  }

  private fanout = (event: string, payload: Payload): void => {
    const set = this.handlers.get(event);
    if (!set) return;
    set.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        // One bad subscriber must never break the fan-out to the others.
        captureError(err as Error, { scope: 'realtime-fanout', event });
      }
    });
  };

  private createSocket(): void {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem(TOKEN_STORAGE_KEY)
        : null;

    const url = `${socketBaseUrl()}${LOBBY_NAMESPACE}`;
    const opts: Record<string, unknown> = {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
      reconnection: true,
      // Session-long connection: never permanently give up (the per-hook
      // sockets implicitly "reset" by remounting; the singleton can't).
      reconnectionAttempts: Infinity,
      reconnectionDelay: RECONNECT_DELAY_MS,
    };
    const socket = this.socketFactory
      ? this.socketFactory(url, opts)
      : io(url, opts);

    socket.on('connect', () => {
      // Server rooms are per-connection: re-join every ref-counted room on
      // the initial connect AND on every reconnection.
      for (const key of this.roomRefs.keys()) {
        const [kind, id] = key.split(':') as [RoomKind, string];
        this.emitJoin(kind, id);
      }
      this.fanout('connect', undefined);
    });
    socket.on('disconnect', (reason: Payload) => this.fanout('disconnect', reason));
    socket.on('connect_error', (err: Error) =>
      this.fanout('connect_error', err?.message),
    );
    // Server-pushed events (new-message, new-dm, notification, …) — fan out
    // single-payload style. Lifecycle events are wired explicitly above.
    socket.onAny((event: string, ...args: unknown[]) => {
      this.fanout(event, args[0]);
    });

    this.socket = socket;
  }

  private destroy(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.roomRefs.clear();
  }
}

/** App-wide singleton (module scope — one per browser session). */
let client: RealtimeClient | undefined;

export function getRealtime(): RealtimeClient {
  if (!client) client = new RealtimeClient();
  return client;
}
