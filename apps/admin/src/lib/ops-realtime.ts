import { io, type Socket } from 'socket.io-client';
import { captureError } from '@/providers/ObservabilityProvider';
import { getToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const WS_BASE = API_URL.replace(/\/api\/v1$/, '');

type Handler = (payload: unknown) => void;

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
 */
class OpsRealtimeClient {
  private socket: Socket | null = null;
  private consumers = 0;
  /** event → (original handler → wrapped handler), so off() removes exactly one. */
  private handlers = new Map<string, Map<Handler, Handler>>();

  /** Acquire: bump the consumer count and ensure the socket exists. */
  connect(): void {
    this.consumers += 1;
    if (this.socket) return;
    const token = getToken();
    if (!token) {
      // Unauthenticated mount — nothing to connect with. Roll the count back
      // so a later connect() cycle (e.g. after a same-tab login) retries;
      // under the guarded layout this path is unreachable, the guard is
      // defence in depth, not a live branch.
      this.consumers = Math.max(0, this.consumers - 1);
      return;
    }

    const socket: Socket = io(`${WS_BASE}/lobby`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    // Re-attach handlers from a previous session of this client.
    for (const [event, wrapped] of this.handlers) {
      for (const wrapper of wrapped.values()) socket.on(event, wrapper);
    }
    this.socket = socket;
  }

  /** Release: at zero consumers the socket is torn down. */
  disconnect(): void {
    this.consumers = Math.max(0, this.consumers - 1);
    if (this.consumers > 0 || !this.socket) return;
    this.socket.disconnect();
    this.socket = null;
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
