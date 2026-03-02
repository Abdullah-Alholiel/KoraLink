import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

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
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    // Validate origin against the configured whitelist.
    const origin = client.handshake.headers?.origin;
    const playerUrl = this.config.get<string>('PLAYER_URL', 'http://localhost:3000');
    const adminUrl = this.config.get<string>('ADMIN_URL', 'http://localhost:3002');
    const allowedOrigins = [playerUrl, adminUrl];

    if (origin && !allowedOrigins.includes(origin)) {
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

      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET', 'fallback-dev-secret'),
      });

      client.userId = payload.sub;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    // Rooms are cleaned up automatically by Socket.IO on disconnect.
    console.log(`Client disconnected: ${client.id}`);
  }

  // ── Join a match lobby ───────────────────────────────────────────────────

  @SubscribeMessage('join-lobby')
  async handleJoinLobby(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');

    const membership = await this.prisma.matchPlayer.findUnique({
      where: {
        match_id_user_id: {
          match_id: data.matchId,
          user_id: client.userId,
        },
      },
    });

    if (!membership) throw new WsException('You are not a member of this match.');

    await client.join(`match:${data.matchId}`);
    client.to(`match:${data.matchId}`).emit('user-joined', { userId: client.userId });
  }

  // ── Chat message ─────────────────────────────────────────────────────────

  @SubscribeMessage('send-message')
  async handleMessage(
    @MessageBody() data: { matchId: string; content: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    if (!client.userId) throw new WsException('Unauthenticated');
    if (!data.content?.trim()) throw new WsException('Message cannot be empty.');

    const message = await this.prisma.matchMessage.create({
      data: {
        match_id: data.matchId,
        user_id: client.userId,
        content: data.content.trim(),
      },
      include: {
        user: {
          select: { id: true, full_name: true, handle: true, avatar_url: true },
        },
      },
    });

    this.server
      .to(`match:${data.matchId}`)
      .emit('new-message', message);
  }

  // ── Roster update broadcast (called from MatchesService) ─────────────────

  broadcastRosterUpdate(matchId: string, payload: unknown): void {
    this.server.to(`match:${matchId}`).emit('roster-update', payload);
  }
}
