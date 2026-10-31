import { io, type Socket } from 'socket.io-client';
import { captureError } from '@/providers/ObservabilityProvider';
import { getToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const WS_BASE = API_URL.replace(/\/api\/v1$/, '');

type Handler = (payload: unknown) => void;

/**
 * Connection health of the shared ops socket, surfaced in the notification
 * drawer so operators can tell "nothing happened" from "we stopped listening"
 * (P2-143).
 * - `connecting`   — initial handshake, or a manual reconnect() in flight
 * - `live`         — socket connected, events flowing
 * - `reconnecting` — dropped by the network/server; socket.io is retrying
 * - `offline`      — browser reports no network (supersedes everything)
 * - `lost`         — all reconnection attempts exhausted; feed is stale
 */
export type OpsSocketStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'lost';

type StatusListener = (s: OpsSocketStatus) => void;

/**
 * Shared ops realtime client — ONE authenticated /lobby socket per console
 * session, ref-counted, no matter how many components consume live events.
 *
 * Mirrors the PWA's RealtimeClient (Slice 2, PR #32): every extra socket pays
 * a full server-side handshake (JWT verify + users-row SELECT), so the
 * notification surface must not become yet another per-component connection
 * beside useLiveAdminData's per-page sockets.
 *
 * Semantics:
 * - `connect()`/`disconnect()` are ref-counted; at zero consumers the socket
 *   is destroyed and the token is re-read on the next `connect()` (logout
 *   hard-navigates today, but a same-tab re-login also gets a fresh socket).
 * - Handlers survive reconnects (socket.io keeps listeners) and are
 *   re-attached if the client is re-created while a consumer stays mounted.
 * - Handler exceptions are isolated — one bad subscriber cannot break the
 *   fan-out to the others (same contract as the PWA client).
 * - Ops-room membership itself is server-side: the handshake joins the `ops`
 *   room for Admin/VenueOwner roles (app.gateway.ts handleConnection), so a
 *   reconnect automatically re-joins — nothing to replay client-side.
 * - Status: `getStatus()`/`onStatus()` expose connection health; while the
 *   browser is offline the effective status is `offline`, and the underlying
 *   socket status is restored once it comes back online. `reconnect()` is the
 *   manual retry after `reconnect_failed` (attempts exhausted).
 */
class OpsRealtimeClient {
  private socket: Socket | null = null;
  private consumers = 0;
  /** event → (original handler → wrapped handler), so off() removes exactly one. */
  private handlers = new Map<string, Map<Handler, Handler>>();
  /** Socket-level status, independent of browser connectivity. */
  private socketStatus: OpsSocketStatus = 'connecting';
  private browserOffline = false;
  private statusListeners = new Set<StatusListener>();

  constructor() {
    if (typeof window === 'undefined') return;
    this.browserOffline = navigator.onLine === false;
    window.addEventListener('online', () => this.setBrowserOffline(false));
    window.addEventListener('offline', () => this.setBrowserOffline(true));
  }

  /** Acquire: bump the consumer count and ensure the socket exists. */
  connect(): void {
    this.consumers += 1;
    if (this.socket) return;
    if (!this.init()) {
      // Unauthenticated mount — nothing to connect with. Roll the count back
      // so a later connect() cycle (e.g. after a same-tab login) retries;
      // under the guarded layout this path is unreachable, the guard is
      // defence in depth, not a live branch.
      this.consumers = Math.max(0, this.consumers - 1);
    }
  }

  /** Effective status — `offline` takes precedence over the socket state. */
  getStatus(): OpsSocketStatus {
    return this.browserOffline ? 'offline' : this.socketStatus;
  }

  /** Subscribe to status changes; returns the unsubscribe function. */
  onStatus(cb: (s: OpsSocketStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  /**
   * Manual retry (the drawer's Retry button after `lost`): reset the backoff
   * attempt counter and reopen. With no socket yet (e.g. the token was
   * missing on mount), re-run the initial setup instead.
   */
  reconnect(): void {
    this.setSocketStatus('connecting');
    if (!this.socket) {
      // No token to connect with — keep the Retry affordance visible.
      if (!this.init()) this.setSocketStatus('lost');
      return;
    }
    if (this.socket.connected) {
      this.setSocketStatus('live');
      return;
    }
    // socket.io resets its backoff itself before emitting reconnect_failed;
    // resetting here as well keeps a mid-cycle manual retry on a full budget.
    // `backoff` is not part of the public Manager typings.
    (this.socket.io as unknown as { backoff?: { reset?: () => void } }).backoff?.reset?.();
    this.socket.connect();
  }

  private setSocketStatus(next: OpsSocketStatus): void {
    const before = this.getStatus();
    this.socketStatus = next;
    this.emitIfChanged(before);
  }

  private setBrowserOffline(offline: boolean): void {
    const before = this.getStatus();
    this.browserOffline = offline;
    this.emitIfChanged(before);
  }

  private emitIfChanged(before: OpsSocketStatus): void {
    const after = this.getStatus();
    if (after === before) return;
    for (const cb of this.statusListeners) {
      try {
        cb(after);
      } catch (err) {
        captureError(err, { area: 'ops-realtime', event: 'status' });
      }
    }
  }

  /**
   * Create the authenticated socket (no ref-count change). Returns false when
   * there is no token to connect with.
   */
  private init(): boolean {
    const token = getToken();
    if (!token) return false;

    const socket: Socket = io(`${WS_BASE}/lobby`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => this.setSocketStatus('live'));
    socket.on('disconnect', (reason) => {
      // A deliberate client-side close (ref-count teardown) is not an outage.
      if (reason === 'io client disconnect') return;
      // A server-side kick (e.g. the gateway rejecting an expired JWT) is not
      // retried by socket.io-client — surface it as lost so Retry is offered.
      if (reason === 'io server disconnect') {
        this.setSocketStatus('lost');
        return;
      }
      this.setSocketStatus('reconnecting');
    });
    // Attempts exhausted — emitted on the Manager, not the Socket.
    socket.io.on('reconnect_failed', () => this.setSocketStatus('lost'));

    // Re-attach handlers from a previous session of this client.
    for (const [event, wrapped] of this.handlers) {
      for (const wrapper of wrapped.values()) socket.on(event, wrapper);
    }
    this.socket = socket;
    return true;
  }

  /** Release: at zero consumers the socket is torn down. */
  disconnect(): void {
    this.consumers = Math.max(0, this.consumers - 1);
    if (this.consumers > 0 || !this.socket) return;
    this.socket.disconnect();
    this.socket = null;
    this.setSocketStatus('connecting');
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Subscribe; returns the unsubscribe function. */
  on(event: string, handler: Handler): () => void {
    let wrapped = this.handlers.get(event);
    if (!wrapped) {
      wrapped = new Map();
      this.handlers.set(event, wrapped);
    }
    const wrapper: Handler = (payload) => {
      try {
        handler(payload);
      } catch (err) {
        captureError(err, { area: 'ops-realtime', event });
      }
    };
    wrapped.set(handler, wrapper);
    this.socket?.on(event, wrapper);
    return () => {
      const map = this.handlers.get(event);
      if (!map) return;
      map.delete(handler);
      if (map.size === 0) this.handlers.delete(event);
      this.socket?.off(event, wrapper);
    };
  }
}

/** Console-wide singleton — see NotificationCenter for the sole consumer. */
export const opsRealtime = new OpsRealtimeClient();
