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
import { WsRateLimitService } from './rate-limit.service';

/** Parity with the REST message DTOs (@MaxLength(2000)). */
const WS_MESSAGE_MAX_LENGTH = 2000;

/** Parity with the REST DTO cap (@MaxLength(36)) and the varchar(36) client_message_id column. */
const WS_CLIENT_MESSAGE_ID_MAX_LENGTH = 36;

/** Same UUID-shape regex the REST DTOs use (@Matches — see reports/dto/create-report.dto.ts). */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize the optional clientMessageId socket field: absent/null → null,
 * string → trimmed (empty → null), anything else → WsException. A hostile
 * payload can carry a number/object here; without the typeof guard the
 * `.trim()` call would throw a raw TypeError at the handler instead of a
 * clean validation error (PR-Agent minor, run #78).
 */
function normalizeClientMessageId(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new WsException('clientMessageId must be a string.');
  }
  const trimmed = v.trim();
  return trimmed || null;
}

/**
 * Room ids arrive as raw socket payloads and become room names (`match:<id>`,
 * `conv:<id>`) and query params. WS handlers get no class-validator pass, so
 * reject anything that is not UUID-shaped before it reaches a room or the DB.
 */
function isUuidShape(v: unknown): boolean {
  return typeof v === 'string' && UUID_SHAPE.test(v);
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  role?: string;
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
    private readonly rateLimit: WsRateLimitService,
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

    // P1-17c (run #27): the previous code gated the rejection on NODE_ENV
    // === 'production' so dev / tailnet / LAN tooling could attach from an
    // origin not yet listed in PLAYER_URL / ADMIN_URL. Strix flagged this
    // (run #25) — the auth check still applies, but `credentials: true` on
    // the WS cors means the session cookie travels on any accepted origin.
    // Tighten: ALWAYS reject unlisted origins. Listing PLAYER_URL / ADMIN_URL
    // for any new local interface is a one-env-var change; loosening at the
    // gateway is a privilege-escalation surface we don't need.
    if (origin && !allowedOrigins.includes(origin)) {
      this.logger.warn(
        `WS connection from unlisted origin "${origin}" rejected (allowlist: ${allowedOrigins.join(', ')})`,
      );
      client.disconnect(true);
      return;
    }

    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.cookie
          ?.split('; ')
          .find((c) => c.startsWith('access_token='))
          ?.split('=')[1];

      if (!token) throw new Error('No token');

      const payload = this.jwt.verify<{ sub: string; role?: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      // Re-read the user row so moderation actions (ban/suspend) and role
      // changes apply IMMEDIATELY on the socket — a JWT can outlive them.
      // Mirrors jwt-cookie.strategy.validate(): REST 401s banned/suspended
      // users; the socket must refuse the handshake just as strictly, else a
      // banned user keeps chat/DM access until token expiry (up to 7 days).
      // P1-36 (run #31): deleted_at is checked too — a soft-deleted user's
      // regular JWT must not keep realtime access (REST 401s the same token;
      // the WS layer was the only surface that ignored PDPL deletion).
      const [user] = await this.db
        .select({
          id: users.id,
          role: users.role,
          banned_at: users.banned_at,
          suspended_until: users.suspended_until,
          deleted_at: users.deleted_at,
        })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (!user) {
        this.logger.warn(`WS connection rejected: account ${payload.sub} no longer exists`);
        client.disconnect(true);
        return;
      }
      // P1-48 (run #57): the moderation predicate is shared with the
      // per-message gate (requireActiveUser below) — one source of truth for
      // "may this account act?" across handshake and message path.
      const reason = this.moderationReason(user);
      if (reason === 'banned') {
        this.logger.warn(`WS connection rejected: account ${payload.sub} is banned`);
        client.disconnect(true);
        return;
      }
      if (reason === 'suspended') {
        this.logger.warn(
          `WS connection rejected: account ${payload.sub} suspended until ${user.suspended_until?.toISOString()}`,
        );
        client.disconnect(true);
        return;
      }
      // P1-36 (run #31): PDPL parity with the REST strategy — a soft-deleted
      // user (regular token, purpose-less) is disconnected at handshake. The
      // restore-token flow never opens a socket: the PWA calls only
      // POST /users/me/restore over REST while deleted.
      if (user.deleted_at) {
        this.logger.warn(
          `WS connection rejected: account ${payload.sub} is soft-deleted (PDPL)`,
        );
        client.disconnect(true);
        return;
      }

      client.userId = payload.sub;
      // DB role (fresh), never the stale token claim — an admin demotion must
      // revoke /ops access on the very next socket connect, not at re-login.
      client.role = user.role;

      // Every authenticated socket joins the user's personal room so the
      // server can push notifications/badge updates at any time.
      await client.join(this.realtime.userRoom(payload.sub));

      // Ops consoles (admin HQ + partner portal) get live data-change pings
      // so tables/metrics refresh without manual reload.
      if (user.role === 'Admin' || user.role === 'VenueOwner') {
        await client.join('ops');
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    // Rooms are cleaned up automatically by Socket.IO on disconnect.
    // Release the socket's rate-limit buckets too (run #37) — otherwise every
    // socket that ever sent a message leaks its Map entry for process lifetime.
    this.rateLimit.release(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Per-message moderation gate (P1-48, run #57) ─────────────────────────
  // The handshake check above rejects banned/suspended/deleted accounts at
  // connect time, but a socket can outlive the moderation action by days (the
  // JWT lives 7 days): an admin banning a user mid-session must stop their
  // NEXT send-message/send-dm/join on the live connection, not just their
  // next reconnect. REST re-reads the user row on EVERY request
  // (jwt-cookie.strategy.validate()); the WS layer now does the same on every
  // state-changing event. Cost: one PK SELECT over 3 columns per event —
  // sub-millisecond, and send paths are already rate-limited (P1-42).
  //
  // leave-conversation is deliberately NOT gated: it only shrinks the
  // caller's own event surface, and gating would trap a banned/removed user
  // inside rooms they should be escaping (same rationale as P2-6).

  /**
   * Shared moderation predicate — same shape and order the handshake check
   * and jwt-cookie.strategy.validate() enforce: banned → suspended (future
   * only) → deleted. Returns why the account may not act, or null if active.
   */
  private moderationReason(user: {
    banned_at: Date | null;
    suspended_until: Date | null;
    deleted_at?: Date | null;
  }): 'banned' | 'suspended' | 'deleted' | null {
    if (user.banned_at) return 'banned';
    if (user.suspended_until && user.suspended_until.getTime() > Date.now()) return 'suspended';
    if (user.deleted_at) return 'deleted';
    return null;
  }

  /**
   * Re-read the caller's account state and throw when it may no longer act.
   * Every state-changing @SubscribeMessage handler calls this right after its
   * `!client.userId` guard, BEFORE rate-limit consumption, membership reads,
   * writes, or broadcasts. A missing row (account hard-removed) blocks too.
   */
  private async requireActiveUser(userId: string): Promise<void> {
    const [user] = await this.db
      .select({
        banned_at: users.banned_at,
        suspended_until: users.suspended_until,
        deleted_at: users.deleted_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || this.moderationReason(user) !== null) {
      throw new WsException('Your account can no longer perform this action.');
    }
  }

  // ── Graceful shutdown ────────────────────────────────────────────────────
  // Runs on SIGTERM (systemd restart) once enableShutdownHooks() is set in
  // main.ts. Closes the io Server so active sockets drain instead of being cut.

  beforeApplicationShutdown(signal?: string): void {
    // this.server is the /lobby Namespace; its `.server` is the parent io Server.
    const io = (this.server as unknown as import('socket.io').Namespace).server;
    io.close();
    this.logger.log(`Socket.IO server closed (${signal ?? 'shutdown'})`);
  }

  // ── Join a match lobby ───────────────────────────────────────────────────

  @SubscribeMessage('join-lobby')
  async handleJoinLobby(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!isUuidShape(data.matchId)) throw new WsException('Invalid id format.');
    // P1-48 (run #57): mid-session moderation gate (see requireActiveUser).
    await this.requireActiveUser(client.userId);

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

  // ── Leave a match lobby ──────────────────────────────────────────────────
  // Room membership is "currently viewing" for the chat-notify fan-out in
  // handleMessage (absent roster members get the bell + web push). The PWA's
  // shared realtime client (lib/realtime.ts, Slice 2) leaves explicitly when
  // the LAST viewer of a match unmounts; a stale room member would silently
  // stop receiving those notifications. Leave is deliberately NOT
  // membership-gated (same rationale as P2-6 leave-conversation): it only
  // shrinks the caller's own event surface.
  @SubscribeMessage('leave-lobby')
  async handleLeaveLobby(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!isUuidShape(data.matchId)) throw new WsException('Invalid id format.');
    // P1-48 gate parity (merged from realtime-singleton lane): leave is a
    // mutating membership op — same moderation gate as join-lobby.
    await this.requireActiveUser(client.userId);
    await client.leave(`match:${data.matchId}`);
  }

  // ── Chat message ─────────────────────────────────────────────────────────

  @SubscribeMessage('send-message')
  async handleMessage(
    @MessageBody() data: { matchId: string; content: string; clientMessageId?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!isUuidShape(data.matchId)) throw new WsException('Invalid id format.');
    // P1-48 (run #57): mid-session moderation gate (see requireActiveUser).
    await this.requireActiveUser(client.userId);
    if (!data.content?.trim()) throw new WsException('Message cannot be empty.');

    const content = data.content.trim();
    const clientMessageId = normalizeClientMessageId(data.clientMessageId);
    // Cap before the DB: an oversized id would surface a raw Postgres
    // 'value too long' error, leaking column internals to the client.
    if (clientMessageId && clientMessageId.length > WS_CLIENT_MESSAGE_ID_MAX_LENGTH) {
      throw new WsException(
        `clientMessageId must be at most ${WS_CLIENT_MESSAGE_ID_MAX_LENGTH} characters.`,
      );
    }

    // Parity with the REST DTO: reject oversized payloads before any DB work.
    if (content.length > WS_MESSAGE_MAX_LENGTH) {
      throw new WsException(`Message is too long (max ${WS_MESSAGE_MAX_LENGTH} characters).`);
    }

    // P1-42 (run #36) + run #78: per-socket bucket AND a per-user cross-socket
    // bucket — reconnecting no longer refills the budget.
    const rl = this.rateLimit.consume(`msg:${client.id}`, client.userId);
    if (!rl.allowed) {
      throw new WsException(`Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`);
    }

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
        .onConflictDoNothing()
        .returning();
      messageRow = insertedMessage;
      // Concurrent retry won the race (unique index match_messages_client_msg_uidx):
      // re-read the winner's row instead of raising a unique-violation 500.
      if (!messageRow && clientMessageId) {
        messageRow = await this.db.query.match_messages.findFirst({
          where: and(
            eq(match_messages.user_id, client.userId),
            eq(match_messages.match_id, data.matchId),
            eq(match_messages.client_message_id, clientMessageId),
          ),
        });
      }
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

  // ── Match chat typing indicator (P2-99, run #74) ──────────────────────────

  /**
   * Relays "user is typing" to the match lobby. Deliberately stateless: no
   * DB write, no persistence — the client re-emits every ~3s while typing and
   * receivers expire the signal after ~4s of silence.
   *
   * Guard chain (proportionate to mark-chat-read, per the P2-74 tripwire):
   * moderation gate FIRST, then a typing rate-limit bucket, then a membership
   * proof. The membership read is required even though `.to(room)` skips the
   * sender: a socket that never joined `match:<id>` (never passed join-lobby's
   * membership check) could otherwise target any room it can name.
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!isUuidShape(data.matchId)) throw new WsException('Invalid id format.');
    // P1-48 (run #57): mid-session moderation gate (see requireActiveUser).
    await this.requireActiveUser(client.userId);

    // Independent bucket — typing bursts must never consume the msg/dm budgets.
    const rl = this.rateLimit.consume(`typing:${client.id}`, client.userId);
    if (!rl.allowed) {
      throw new WsException(`Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`);
    }

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

    // Everyone in the lobby EXCEPT the typer (client.to semantics).
    client
      .to(`match:${data.matchId}`)
      .emit('typing', { matchId: data.matchId, userId: client.userId });
  }

  // ── Join a conversation (DM room) ────────────────────────────────────────

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!isUuidShape(data.conversationId)) throw new WsException('Invalid id format.');
    // P1-48 (run #57): mid-session moderation gate (see requireActiveUser).
    await this.requireActiveUser(client.userId);

    const ok = await this.conversationsService.isParticipant(client.userId, data.conversationId);
    if (!ok) throw new WsException('You are not a participant in this conversation.');

    await client.join(`conv:${data.conversationId}`);
    await this.conversationsService.markRead(client.userId, data.conversationId);
  }

  // ── Mark a conversation read (read receipts) ─────────────────────────────

  /**
   * Client emits this when new messages arrive while the thread is open
   * (join-conversation only covers the moment of joining). Marks the caller's
   * cursor and tells the OTHER participant 'dm-read' so their list/badge
   * updates live. Fires no side effects beyond the cursor write.
   */
  @SubscribeMessage('mark-read')
  async handleMarkRead(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!isUuidShape(data.conversationId)) throw new WsException('Invalid id format.');
    // P1-48 (run #57): mid-session moderation gate (see requireActiveUser).
    await this.requireActiveUser(client.userId);

    const ok = await this.conversationsService.isParticipant(client.userId, data.conversationId);
    if (!ok) throw new WsException('You are not a participant in this conversation.');

    await this.conversationsService.markRead(client.userId, data.conversationId);
    // Read receipt → the other participant clears their unread badge live.
    client.to(`conv:${data.conversationId}`).emit('dm-read', {
      conversationId: data.conversationId,
      readerId: client.userId,
    });
  }

  // ── Match chat read watermark (P2-58, run #50) ──────────────────────────
  // ChatSheet emits this while the sheet is open; advances the caller's
  // roster-row watermark so the Messages list stops counting the match as
  // unread. NO broadcast — read state is private (unlike messages), so the
  // room is never told. Membership miss (zero updated rows) → WsException,
  // mirroring join-lobby.
  @SubscribeMessage('mark-chat-read')
  async handleMarkChatRead(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!isUuidShape(data.matchId)) throw new WsException('Invalid id format.');
    // P1-48 (run #57): mid-session moderation gate (see requireActiveUser).
    await this.requireActiveUser(client.userId);

    // NOTE: no withTimestamp — match_players has no updated_at column.
    const updated = await this.db
      .update(match_players)
      .set({ last_read_at: new Date() })
      .where(
        and(
          eq(match_players.match_id, data.matchId),
          eq(match_players.user_id, client.userId),
        ),
      )
      .returning({ id: match_players.id });

    if (updated.length === 0) {
      throw new WsException('You are not a member of this match.');
    }
  }

  // ── Send a direct message ────────────────────────────────────────────────

  @SubscribeMessage('send-dm')
  async handleDm(
    @MessageBody() data: { conversationId: string; content: string; clientMessageId?: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!isUuidShape(data.conversationId)) throw new WsException('Invalid id format.');
    // P1-48 (run #57): mid-session moderation gate (see requireActiveUser).
    await this.requireActiveUser(client.userId);
    if (!data.content?.trim()) throw new WsException('Message cannot be empty.');

    const content = data.content.trim();
    // Same cap as send-message (REST send-message.dto.ts parity) — the service
    // trims again itself, so only the length check lives here.
    const clientMessageId = normalizeClientMessageId(data.clientMessageId);
    if (clientMessageId && clientMessageId.length > WS_CLIENT_MESSAGE_ID_MAX_LENGTH) {
      throw new WsException(
        `clientMessageId must be at most ${WS_CLIENT_MESSAGE_ID_MAX_LENGTH} characters.`,
      );
    }

    // REST DTO parity: same 2000-char cap the conversations REST endpoint enforces.
    if (content.length > WS_MESSAGE_MAX_LENGTH) {
      throw new WsException(`Message is too long (max ${WS_MESSAGE_MAX_LENGTH} characters).`);
    }

    // P1-42 (run #36): independent DM bucket — lobby traffic never consumes DM
    // budget. Run #78: plus the per-user cross-socket DM bucket.
    const rl = this.rateLimit.consume(`dm:${client.id}`, client.userId);
    if (!rl.allowed) {
      throw new WsException(`Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`);
    }

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
    // P2-6: every handler authenticates — no exceptions (also closes the
    // window where an event arrives before handleConnection's async
    // disconnect completes). A participant check is DELIBERATELY omitted:
    // leave only shrinks the caller's own event surface, and blocking the
    // leave of a since-removed participant would trap them in the room.
    if (!client.userId) throw new WsException('Unauthenticated');
    await client.leave(`conv:${data.conversationId}`);
  }

  // ── Roster update broadcast (called from MatchesService) ─────────────────

  broadcastRosterUpdate(matchId: string, payload: unknown): void {
    this.server.to(`match:${matchId}`).emit('roster-update', payload);
  }

  // ── Admin-initiated force-disconnect (P1-50, run #57) ─────────────────────
  /**
   * Drop every live socket of a user (their personal room) — called by the
   * admin users service right after a ban/suspension lands. The per-message
   * gate (requireActiveUser) already blocks the user's NEXT action, but the
   * stale socket would otherwise linger connected; killing it makes the
   * enforcement immediate and visible: the PWA sees 'disconnect', its normal
   * reconnect path re-runs the handshake, and the handshake now refuses.
   */
  disconnectUser(userId: string): void {
    const room = this.realtime.userRoom(userId);
    this.server.in(room).disconnectSockets(true);
    this.logger.log(`Force-disconnected sockets for user ${userId} (moderation action)`);
  }

  // ── Status update broadcast (called from MatchesService) ──────────────────

  broadcastStatusUpdate(matchId: string, payload: unknown): void {
    this.server.to(`match:${matchId}`).emit('status-update', payload);
  }

  // ── POTM decided broadcast (called from MatchesService) ──────────────────

  broadcastPomDecided(matchId: string, payload: unknown): void {
    this.server.to(`match:${matchId}`).emit('pom-decided', payload);
  }

  // ── Ops console ping (admin HQ + partner portal live refresh) ────────────
  //
  // Emitted after ANY mutation the ops consoles display. Payload is a bare
  // entity name — clients refetch their own (role-scoped) data; no row data
  // is pushed, so a partner socket never receives admin-only rows.

  broadcastOps(entity: 'users' | 'matches' | 'venues' | 'disputes' | 'transactions' | 'settlements'): void {
    this.server.to('ops').emit('ops-data-changed', { entity });
  }
}
