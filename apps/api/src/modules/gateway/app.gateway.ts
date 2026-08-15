import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { match_players, match_messages, users } from '../../database/schema';
import { ConversationsService } from '../conversations/conversations.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from './realtime.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

type DB = PostgresJsDatabase<typeof schema>;

@WebSocketGateway({
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      // Origins are validated at connect time using ConfigService inside the class.
      // This factory approach is used because static decorator values cannot read
      // runtime config; actual origin check happens in handleConnection.
      callback(null, true);
    },
    credentials: true,
  },
  namespace: '/lobby',
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppGateway.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly conversationsService: ConversationsService,
    private readonly realtime: RealtimeService,
    private readonly activitiesService: ActivitiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  afterInit(): void {
    this.realtime.registerServer(this.server);
    this.logger.log('Gateway initialised — realtime server registered');
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    // Validate origin against the configured whitelist.
    const origin = client.handshake.headers?.origin;
    const playerUrls = this.config
      .get<string>('PLAYER_URL', 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const adminUrls = this.config
      .get<string>('ADMIN_URL', 'http://localhost:3002')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedOrigins = [...playerUrls, ...adminUrls];

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (origin && !allowedOrigins.includes(origin)) {
      // In production, reject outright. In development, log a warning but keep
      // the connection so local tooling (e.g. a dev server on a LAN IP that is
      // not yet listed in PLAYER_URL) still works — auth still applies, this
      // only relaxes the browser-origin check, never authentication.
      if (isProd) {
        client.disconnect(true);
        return;
      }
      this.logger.warn(
        `WS connection from unlisted origin "${origin}" allowed (development mode)`,
      );
    }

    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.cookie
          ?.split('; ')
          .find((c) => c.startsWith('access_token='))
          ?.split('=')[1];

      if (!token) throw new Error('No token');

      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET', 'fallback-dev-secret'),
      });

      client.userId = payload.sub;

      // Every authenticated socket joins the user's personal room so the
      // server can push notifications/badge updates at any time.
      await client.join(this.realtime.userRoom(payload.sub));
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    // Rooms are cleaned up automatically by Socket.IO on disconnect.
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Join a match lobby ───────────────────────────────────────────────────

  @SubscribeMessage('join-lobby')
  async handleJoinLobby(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');

    const [membership] = await this.db
      .select({ id: match_players.id })
      .from(match_players)
      .where(
        and(
          eq(match_players.match_id, data.matchId),
          eq(match_players.user_id, client.userId),
        ),
      )
      .limit(1);

    if (!membership) throw new WsException('You are not a member of this match.');

    await client.join(`match:${data.matchId}`);
    client.to(`match:${data.matchId}`).emit('user-joined', { userId: client.userId });
  }

  // ── Chat message ─────────────────────────────────────────────────────────

  @SubscribeMessage('send-message')
  async handleMessage(
    @MessageBody() data: { matchId: string; content: string; clientMessageId?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!data.content?.trim()) throw new WsException('Message cannot be empty.');

    const content = data.content.trim();
    const clientMessageId = data.clientMessageId?.trim() || null;

    // Only match members may post to the lobby.
    const [membership] = await this.db
      .select({ id: match_players.id })
      .from(match_players)
      .where(
        and(
          eq(match_players.match_id, data.matchId),
          eq(match_players.user_id, client.userId),
        ),
      )
      .limit(1);

    if (!membership) throw new WsException('You are not a member of this match.');

    // Idempotency — a retried send with the same clientMessageId returns the
    // already-persisted message instead of inserting a duplicate.
    let messageRow: typeof match_messages.$inferSelect | undefined;
    if (clientMessageId) {
      messageRow = await this.db.query.match_messages.findFirst({
        where: and(
          eq(match_messages.user_id, client.userId),
          eq(match_messages.match_id, data.matchId),
          eq(match_messages.client_message_id, clientMessageId),
        ),
      });
    }

    if (!messageRow) {
      const [insertedMessage] = await this.db
        .insert(match_messages)
        .values({
          match_id: data.matchId,
          user_id: client.userId,
          content,
          client_message_id: clientMessageId,
        })
        .returning();
      messageRow = insertedMessage;
    }

    const [user] = await this.db
      .select({
        id: users.id,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
      })
      .from(users)
      .where(eq(users.id, client.userId))
      .limit(1);

    const message = { ...messageRow, user };

    this.server
      .to(`match:${data.matchId}`)
      .emit('new-message', message);

    // ── Notify participants NOT viewing this match (US8) ────────────────
    // Room membership = currently viewing. Everyone else on the roster gets
    // a personal-room 'notification' (bell/toast) + web push.
    try {
      const roster = await this.db
        .select({ user_id: match_players.user_id })
        .from(match_players)
        .where(eq(match_players.match_id, data.matchId));

      // @WebSocketServer() on a namespaced gateway injects the NAMESPACE, so
      // use its own adapter/socket maps (this.server.sockets is undefined).
      const nsp = this.server as unknown as import('socket.io').Namespace;
      const viewing = [
        ...(nsp.adapter.rooms?.get(`match:${data.matchId}`) ?? new Set<string>()),
      ];
      const viewingUserIds = new Set<string>();
      for (const socketId of viewing) {
        const sock = nsp.sockets.get(socketId) as AuthenticatedSocket | undefined;
        if (sock?.userId) viewingUserIds.add(sock.userId);
      }

      const absent = roster
        .map((r) => r.user_id)
        .filter((uid) => uid !== client.userId && !viewingUserIds.has(uid));

      if (absent.length > 0) {
        const matchRow = await this.db
          .select({ title: schema.matches.title })
          .from(schema.matches)
          .where(eq(schema.matches.id, data.matchId))
          .limit(1);

        await this.activitiesService.record({
          actorId: client.userId,
          verb: 'messaged',
          matchId: data.matchId,
          recipients: absent,
        });

        // Web push for users with no live socket at all (PWA closed).
        const offline = absent.filter((uid) => !this.realtime.isUserOnline(uid));
        if (offline.length > 0) {
          await this.notificationsService.sendPushToUsers(offline, {
            title: `${user.full_name ?? 'KoraLink'}`,
            body: `${data.content.trim().slice(0, 80)} · ${matchRow[0]?.title ?? ''}`,
            data: { type: 'match-chat', matchId: data.matchId },
          });
        }
      }
    } catch (err) {
      this.logger.warn(`chat notify fan-out failed: ${(err as Error).message}`);
    }
  }

  // ── Join a conversation (DM room) ────────────────────────────────────────

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');

    const ok = await this.conversationsService.isParticipant(client.userId, data.conversationId);
    if (!ok) throw new WsException('You are not a participant in this conversation.');

    await client.join(`conv:${data.conversationId}`);
    await this.conversationsService.markRead(client.userId, data.conversationId);
  }

  // ── Send a direct message ────────────────────────────────────────────────

  @SubscribeMessage('send-dm')
  async handleDm(
    @MessageBody() data: { conversationId: string; content: string; clientMessageId?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!data.content?.trim()) throw new WsException('Message cannot be empty.');

    const message = await this.conversationsService.sendMessage(
      client.userId,
      data.conversationId,
      data.content,
      data.clientMessageId,
    );

    this.server.to(`conv:${data.conversationId}`).emit('new-dm', message);
  }

  // ── Leave a conversation (DM room) ───────────────────────────────────────

  @SubscribeMessage('leave-conversation')
  async handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    await client.leave(`conv:${data.conversationId}`);
  }

  // ── Roster update broadcast (called from MatchesService) ─────────────────

  broadcastRosterUpdate(matchId: string, payload: unknown): void {
    this.server.to(`match:${matchId}`).emit('roster-update', payload);
  }

  // ── Status update broadcast (called from MatchesService) ──────────────────

  broadcastStatusUpdate(matchId: string, payload: unknown): void {
    this.server.to(`match:${matchId}`).emit('status-update', payload);
  }

  // ── POTM decided broadcast (called from MatchesService) ──────────────────

  broadcastPomDecided(matchId: string, payload: unknown): void {
    this.server.to(`match:${matchId}`).emit('pom-decided', payload);
  }
}
