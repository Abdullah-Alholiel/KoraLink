import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

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
  private server: Server | null = null;

  registerServer(server: Server): void {
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

  /** True when at least one socket is currently connected in the user's room. */
  isUserOnline(userId: string): boolean {
    if (!this.server) return false;
    const room = this.server.sockets.adapter.rooms?.get(this.userRoom(userId));
    return !!room && room.size > 0;
  }
}
