import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import {
  conversations,
  conversation_participants,
  personal_messages,
  users,
} from '../../database/schema';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../gateway/realtime.service';

type DB = PostgresJsDatabase<typeof schema>;

export interface ConversationParticipantView {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

export interface Conversation {
  id: string;
  participants: ConversationParticipantView[];
  created_at: Date;
}

export interface ConversationSummary {
  id: string;
  otherParticipant: ConversationParticipantView;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
}

export interface PersonalMessage {
  id: string;
  conversation_id: string;
  sender: ConversationParticipantView;
  content: string;
  created_at: Date;
}

@Injectable()
export class ConversationsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly activitiesService: ActivitiesService,
    private readonly notificationsService: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async findOrCreateDirect(userId: string, targetUserId: string): Promise<Conversation> {
    if (userId === targetUserId) {
      throw new BadRequestException('You cannot message yourself.');
    }

    const existing = (await this.db.execute(sql`
      SELECT c.id
      FROM ${conversations} c
      INNER JOIN ${conversation_participants} cp1
        ON cp1.conversation_id = c.id AND cp1.user_id = ${userId}::text
      INNER JOIN ${conversation_participants} cp2
        ON cp2.conversation_id = c.id AND cp2.user_id = ${targetUserId}::text
      LIMIT 1
    `)) as unknown as Array<{ id: string }>;

    if (existing[0]?.id) {
      return this.findConversation(existing[0].id);
    }

    const created = await this.db.transaction(async (tx) => {
      const [conv] = await tx
        .insert(conversations)
        .values({})
        .returning({ id: conversations.id });

      await tx.insert(conversation_participants).values([
        { conversation_id: conv.id, user_id: userId },
        { conversation_id: conv.id, user_id: targetUserId },
      ]);

      return conv;
    });

    return this.findConversation(created.id);
  }

  async listForUser(userId: string): Promise<{
    conversations: ConversationSummary[];
    total: number;
    hasMore: boolean;
  }> {
    const rows = (await this.db.execute(sql`
      SELECT
        c.id,
        other.id AS other_id,
        other.full_name AS other_name,
        other.handle AS other_handle,
        other.avatar_url AS other_avatar,
        last_pm.content AS last_message,
        last_pm.created_at AS last_message_at,
        last_pm.sender_id AS last_message_sender_id,
        (SELECT COUNT(*)::int
          FROM ${personal_messages} pm2
          WHERE pm2.conversation_id = c.id
            AND pm2.sender_id != ${userId}::text
            AND pm2.created_at > COALESCE(cp.last_read_at, 'epoch'::timestamptz)
        ) AS unread_count
      FROM ${conversations} c
      INNER JOIN ${conversation_participants} cp
        ON cp.conversation_id = c.id AND cp.user_id = ${userId}::text
      INNER JOIN ${conversation_participants} cp2
        ON cp2.conversation_id = c.id AND cp2.user_id != ${userId}::text
      INNER JOIN ${users} other ON other.id = cp2.user_id
      LEFT JOIN LATERAL (
        SELECT pm.content, pm.created_at, pm.sender_id
        FROM ${personal_messages} pm
        WHERE pm.conversation_id = c.id
        ORDER BY pm.created_at DESC
        LIMIT 1
      ) last_pm ON true
      ORDER BY COALESCE(last_pm.created_at, c.updated_at) DESC
      LIMIT 50
    `)) as unknown as RawConversationRow[];

    const list = rows.map((r) => ({
      id: r.id,
      otherParticipant: {
        id: r.other_id,
        full_name: r.other_name,
        handle: r.other_handle,
        avatar_url: r.other_avatar,
      },
      lastMessage: r.last_message,
      lastMessageAt: r.last_message_at,
      lastMessageSenderId: r.last_message_sender_id,
      unreadCount: r.unread_count,
    }));

    return { conversations: list, total: list.length, hasMore: list.length >= 50 };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    page = 1,
    perPage = 30,
  ): Promise<{ messages: PersonalMessage[]; total: number; hasMore: boolean }> {
    await this.assertParticipant(userId, conversationId);
    const limit = Math.min(100, Math.max(1, perPage));
    const offset = (Math.max(1, page) - 1) * limit;

    const rows = (await this.db.execute(sql`
      SELECT
        pm.id,
        pm.conversation_id,
        pm.content,
        pm.created_at,
        u.id AS sender_id,
        u.full_name AS sender_name,
        u.handle AS sender_handle,
        u.avatar_url AS sender_avatar
      FROM ${personal_messages} pm
      INNER JOIN ${users} u ON u.id = pm.sender_id
      WHERE pm.conversation_id = ${conversationId}::text
      ORDER BY pm.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)) as unknown as RawMessageRow[];

    const [count] = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM ${personal_messages}
      WHERE conversation_id = ${conversationId}::text
    `)) as unknown as Array<{ total: number }>;

    // Fetch DESC + reverse → chronological ascending for display.
    const messages = rows.reverse().map((r) => this.mapMessage(r));
    const total = count?.total ?? 0;

    return { messages, total, hasMore: offset + messages.length < total };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<PersonalMessage> {
    const trimmed = content?.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty.');
    }
    await this.assertParticipant(userId, conversationId);

    const [inserted] = await this.db
      .insert(personal_messages)
      .values({
        conversation_id: conversationId,
        sender_id: userId,
        content: trimmed,
      })
      .returning();

    // Sender has read up to this point.
    await this.markRead(userId, conversationId);

    const others = await this.db
      .select({ user_id: conversation_participants.user_id })
      .from(conversation_participants)
      .where(
        and(
          eq(conversation_participants.conversation_id, conversationId),
          sql`${conversation_participants.user_id} != ${userId}::text`,
        ),
      );

    await this.activitiesService.record({
      actorId: userId,
      verb: 'messaged',
      subjectId: others[0]?.user_id,
      recipients: others.map((o) => o.user_id),
    });

    // Web push for recipients with no live socket (PWA closed, US10).
    const offline = others
      .map((o) => o.user_id)
      .filter((uid) => !this.realtime.isUserOnline(uid));
    if (offline.length > 0) {
      const [sender] = await this.db
        .select({ full_name: users.full_name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      await this.notificationsService
        .sendPushToUsers(offline, {
          title: sender?.full_name ?? 'KoraLink',
          body: trimmed.slice(0, 80),
          data: { type: 'dm', conversationId },
        })
        .catch(() => 0);
    }

    const [sender] = await this.db
      .select({
        id: users.id,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return { ...inserted, sender };
  }

  async markRead(userId: string, conversationId: string): Promise<void> {
    await this.db
      .update(conversation_participants)
      .set({ last_read_at: new Date() })
      .where(
        and(
          eq(conversation_participants.conversation_id, conversationId),
          eq(conversation_participants.user_id, userId),
        ),
      );
  }

  async isParticipant(userId: string, conversationId: string): Promise<boolean> {
    const [cp] = await this.db
      .select({ id: conversation_participants.id })
      .from(conversation_participants)
      .where(
        and(
          eq(conversation_participants.conversation_id, conversationId),
          eq(conversation_participants.user_id, userId),
        ),
      )
      .limit(1);

    return !!cp;
  }

  private async assertParticipant(userId: string, conversationId: string): Promise<void> {
    const ok = await this.isParticipant(userId, conversationId);
    if (!ok) {
      throw new ForbiddenException('You are not a participant in this conversation.');
    }
  }

  private async findConversation(conversationId: string): Promise<Conversation> {
    const parts = (await this.db.execute(sql`
      SELECT u.id, u.full_name, u.handle, u.avatar_url
      FROM ${conversation_participants} cp
      INNER JOIN ${users} u ON u.id = cp.user_id
      WHERE cp.conversation_id = ${conversationId}::text
    `)) as unknown as ConversationParticipantView[];

    const [conv] = await this.db
      .select({ id: conversations.id, created_at: conversations.created_at })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conv) {
      throw new NotFoundException('Conversation not found.');
    }

    return { id: conv.id, participants: parts, created_at: conv.created_at };
  }

  private mapMessage(r: RawMessageRow): PersonalMessage {
    return {
      id: r.id,
      conversation_id: r.conversation_id,
      sender: {
        id: r.sender_id,
        full_name: r.sender_name,
        handle: r.sender_handle,
        avatar_url: r.sender_avatar,
      },
      content: r.content,
      created_at: r.created_at,
    };
  }
}

interface RawConversationRow {
  id: string;
  other_id: string;
  other_name: string | null;
  other_handle: string | null;
  other_avatar: string | null;
  last_message: string | null;
  last_message_at: Date | null;
  last_message_sender_id: string | null;
  unread_count: number;
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  content: string;
  created_at: Date;
  sender_id: string;
  sender_name: string | null;
  sender_handle: string | null;
  sender_avatar: string | null;
}
