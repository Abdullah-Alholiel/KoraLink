import { Injectable, Logger } from '@nestjs/common';
import type { Server, Namespace } from 'socket.io';

/**
 * Single choke point for emitting real-time events to connected clients.
 *
 * Lives in its own module so both the Gateway (which registers the io Server
 * on init) and feature services (Activities, Matches, Conversations) can emit
 * without creating import cycles between them.
 *
 * All emits are fire-and-forget: a missing server (tests, CLI contexts) is a
 * silent no-op.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  /**
   * `@WebSocketServer()` on a NAMESPACED gateway (`/lobby`) injects the
   * socket.io Namespace, not the top-level io Server. Both expose `.to()` for
   * emits, but their room maps live in different places (see isUserOnline),
   * so the field is typed as the union.
   */
  private server: Server | Namespace | null = null;

  registerServer(server: Server | Namespace): void {
    this.server = server;
  }

  /** Emit an event to every connected socket of the given users. */
  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    if (!this.server || userIds.length === 0) return;
    for (const userId of userIds) {
      this.server.to(this.userRoom(userId)).emit(event, payload);
    }
  }

  /** Emit an event to one user's personal room. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitToUsers([userId], event, payload);
  }

  userRoom(userId: string): string {
    return `user:${userId}`;
  }

  /**
   * Ping connected ops consoles (admin HQ + partner portal sockets in the
   * `ops` room) that an entity changed. Clients refetch their own role-scoped
   * data — no row payloads are pushed, so partners never receive admin rows.
   */
  broadcastOps(entity: 'users' | 'matches' | 'venues' | 'disputes' | 'transactions' | 'settlements' | 'settings' | 'reports'): void {
    if (!this.server) return;
    this.server.to('ops').emit('ops-data-changed', { entity });
  }

  /** True when at least one socket is currently connected in the user's room. */
  isUserOnline(userId: string): boolean {
    if (!this.server) return false;

    // The injected object can be either a Namespace (namespaced gateway) or a
    // bare Server. A Namespace exposes its rooms on `.adapter.rooms`, while a
    // Server exposes them via `.sockets.adapter.rooms`. Reading `.sockets.adapter`
    // on a Namespace throws `Cannot read properties of undefined (reading 'rooms')`
    // because `Namespace.sockets` is a Map, not a nested server. Handle both.
    const srv = this.server as unknown as {
      adapter?: { rooms?: Map<string, Set<string>> };
      sockets?: { adapter?: { rooms?: Map<string, Set<string>> } };
    };
    const rooms = srv.adapter?.rooms ?? srv.sockets?.adapter?.rooms;
    const room = rooms?.get(this.userRoom(userId));
    return !!room && room.size > 0;
  }
}
