import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
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
import { BlocksService } from '../users/blocks.service';

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
  client_message_id?: string | null;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly activitiesService: ActivitiesService,
    private readonly notificationsService: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly blocksService: BlocksService,
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

    // Canonical sorted-pair key — the unique index conv_pair_unique_idx
    // (migration 0039) makes a concurrent find-or-create for the same pair
    // lose the race atomically instead of inserting a duplicate conversation.
    const pairKey = userId < targetUserId
      ? `${userId}:${targetUserId}`
      : `${targetUserId}:${userId}`;

    try {
      const created = await this.db.transaction(async (tx) => {
        const [conv] = await tx
          .insert(conversations)
          .values({ pair_key: pairKey })
          .returning({ id: conversations.id });

        await tx.insert(conversation_participants).values([
          { conversation_id: conv.id, user_id: userId },
          { conversation_id: conv.id, user_id: targetUserId },
        ]);

        return conv;
      });

      return this.findConversation(created.id);
    } catch (err) {
      // 23505 unique_violation: a concurrent request created the pair first.
      // Re-select by pair_key and return the winner — the caller always gets
      // a valid conversation id and never sees the race.
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505'
      ) {
        const [raced] = (await this.db.execute(sql`
          SELECT id FROM ${conversations} WHERE pair_key = ${pairKey} LIMIT 1
        `)) as unknown as Array<{ id: string }>;
        if (raced?.id) {
          this.logger.log(
            `conversation pair-key collision resolved (pair ${pairKey})`,
          );
          return this.findConversation(raced.id);
        }
      }
      throw err;
    }
  }

  /**
   * Paginated conversation list for the authenticated user (most recent
   * activity first). Page 1 is the only page the current consumers need
   * (unread badge, thread header) — later pages exist so the list is never
   * hard-capped: conversation #51 is reachable via ?page=2.
   *
   * Pagination is OFFSET-based on purpose: this is a bounded per-user list
   * (tens of rows), and the sort key is a COALESCE of last-message time and
   * conversation creation — a keyset cursor over that is fragile for zero
   * gain at this scale. `id` breaks ties so rows can never straddle a page
   * boundary and vanish/duplicate between fetches.
   */
  async listForUser(
    userId: string,
    page = 1,
    perPage = 50,
  ): Promise<{
    conversations: ConversationSummary[];
    total: number;
    hasMore: boolean;
  }> {
    const limit = Math.min(100, Math.max(1, perPage));
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * limit;

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
        ) AS unread_count,
        COUNT(*) OVER()::int AS total_count
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
      ORDER BY COALESCE(last_pm.created_at, c.updated_at) DESC, c.id ASC
      LIMIT ${limit} OFFSET ${offset}
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

    // Authoritative total from the window function — exact hasMore even on
    // the last page (the old length>=cap heuristic reported hasMore=true on
    // a page that was exactly full and also the last).
    const total = rows[0]?.total_count ?? 0;

    return { conversations: list, total, hasMore: offset + list.length < total };
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
        u.avatar_url AS sender_avatar,
        COUNT(*) OVER()::int AS total_count
      FROM ${personal_messages} pm
      INNER JOIN ${users} u ON u.id = pm.sender_id
      WHERE pm.conversation_id = ${conversationId}::text
      ORDER BY pm.created_at DESC, pm.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `)) as unknown as RawMessageRow[];

    // P2-241: authoritative total from the window function (same shape as
    // listForUser) — the separate COUNT query was a second full scan of the
    // same rows. `pm.id` breaks same-timestamp ties so rows can never
    // straddle a page boundary between fetches.
    let total = rows[0]?.total_count ?? 0;
    if (rows.length === 0) {
      // PR-Agent r1 (PR #161): a beyond-end page (stale offset, pruned
      // messages) returns no rows, so the window count never materializes —
      // fall back to ONE degenerate COUNT instead of reporting total 0 for
      // a conversation that still has messages (pre-change truthfulness).
      const [c] = (await this.db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM ${personal_messages}
        WHERE conversation_id = ${conversationId}::text
      `)) as unknown as Array<{ total: number }>;
      total = c?.total ?? 0;
    }

    // Fetch DESC + reverse → chronological ascending for display.
    const messages = rows.reverse().map((r) => this.mapMessage(r));

    return { messages, total, hasMore: offset + messages.length < total };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
    clientMessageId?: string,
  ): Promise<PersonalMessage> {
    const trimmed = content?.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty.');
    }
    const clientMessageIdValue = clientMessageId?.trim() || null;

    // P2-227 (run #149): the conversation lookup, membership proof, block
    // checks, idempotency re-read and the INSERT share ONE transaction guarded
    // by a `SELECT … FOR UPDATE` on the conversation row — the same
    // serialization match chat has had since P2-220 (runs #146–#148).
    // Previously these checks ran as independent statements beside the INSERT.
    // LOCK INVARIANT: every mutation of a conversation's participant set must
    // take this same conversation-row lock. Today the participant set is
    // written exactly once — the create-time insert in startConversation —
    // and has NO removal path (grep-verified run #149), so there is nothing
    // to serialize against yet; if a leave/remove endpoint is ever added it
    // MUST lock the conversation row first or the mid-flight window reopens.
    // RESIDUAL (documented): user_blocks is READ (not locked) inside the tx —
    // a block created between the check and the insert lets exactly one
    // message through; the block rejects every subsequent send. Accepted as a
    // benign one-message race (docs/plans/run149-dm-chat-hardening/).
    const outcome = await this.db.transaction(async (tx) => {
      // Unknown conversation → clean 404 (explicit lookup under the lock; was
      // a membership-check 403 on a nonexistent id before).
      const [convRow] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)
        .for('update');
      if (!convRow) {
        throw new NotFoundException('Conversation not found.');
      }

      const [participant] = await tx
        .select({ id: conversation_participants.id })
        .from(conversation_participants)
        .where(
          and(
            eq(conversation_participants.conversation_id, conversationId),
            eq(conversation_participants.user_id, userId),
          ),
        )
        .limit(1);
      if (!participant) {
        throw new ForbiddenException('You are not a participant in this conversation.');
      }

      // P1-53: refuse the send when a block exists in either direction between
      // the sender and any other participant (403 BLOCKED_BY_RECIPIENT). The
      // participant list rides the outcome for the activity/push side effects.
      // user_blocks is READ (not locked) inside the tx: a block created in the
      // residual window rejects the NEXT send — a benign one-message race,
      // accepted and documented in docs/plans/run149-dm-chat-hardening/.
      const others = await tx
        .select({ user_id: conversation_participants.user_id })
        .from(conversation_participants)
        .where(
          and(
            eq(conversation_participants.conversation_id, conversationId),
            sql`${conversation_participants.user_id} != ${userId}::text`,
          ),
        );
      const othersIds = others.map((o) => o.user_id);
      // P2-241 (Reviewer A run #153): ONE set-based block check covering all
      // other participants — was a per-participant await inside the loop
      // (N queries in-tx; identical verdict and 403 contract at 1:1, but the
      // loop would scale linearly if group conversations ever land).
      await this.blocksService.assertNotBlockedBetweenMany(userId, othersIds);

      // Idempotency — a retried send with the same clientMessageId returns the
      // already-persisted message instead of inserting a duplicate.
      if (clientMessageIdValue) {
        const existing = await tx.query.personal_messages.findFirst({
          where: and(
            eq(personal_messages.sender_id, userId),
            eq(personal_messages.conversation_id, conversationId),
            eq(personal_messages.client_message_id, clientMessageIdValue),
          ),
        });
        if (existing) {
          return { kind: 'winner' as const, row: existing, othersIds };
        }
      }

      const [inserted] = await tx
        .insert(personal_messages)
        .values({
          conversation_id: conversationId,
          sender_id: userId,
          content: trimmed,
          client_message_id: clientMessageIdValue,
        })
        .onConflictDoNothing()
        .returning();

      // Concurrent retry won the race (unique index
      // personal_messages_client_msg_uidx on (sender_id, conversation_id,
      // client_message_id) WHERE client_message_id IS NOT NULL): return the
      // row the winner inserted instead of raising a unique-violation 500 —
      // and skip the side effects below (read receipt, "messaged" activity,
      // push) so a duplicate retry never double-fires them.
      if (!inserted) {
        if (clientMessageIdValue) {
          const winner = await tx.query.personal_messages.findFirst({
            where: and(
              eq(personal_messages.sender_id, userId),
              eq(personal_messages.conversation_id, conversationId),
              eq(personal_messages.client_message_id, clientMessageIdValue),
            ),
          });
          if (winner) {
            return { kind: 'winner' as const, row: winner, othersIds };
          }
        }
        // Lost the unique-key race with no reconcilable winner — surface a 409
        // so the caller retries the send.
        throw new ConflictException('Message send conflicted; retry.');
      }

      return { kind: 'inserted' as const, row: inserted, othersIds };
    });

    // Idempotent/lost-race path: no side effects (a duplicate retry must never
    // re-fire the read receipt, "messaged" activity, or push).
    if (outcome.kind === 'winner') {
      return { ...outcome.row, sender: await this.fetchSenderView(userId) };
    }

    const inserted = outcome.row;
    const othersIds = outcome.othersIds;

    // Sender has read up to this point.
    await this.markRead(userId, conversationId);

    await this.activitiesService.record({
      actorId: userId,
      verb: 'messaged',
      subjectId: othersIds[0],
      recipients: othersIds,
    });

    // Web push for recipients with no live socket (PWA closed, US10).
    const offline = othersIds.filter((uid) => !this.realtime.isUserOnline(uid));
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
          // P0-5 (run #28): DM pushes belong to the `chat` category so the
          // per-category mute gate (sendPushToUsers) can drop them for users
          // who have `chat` muted. The inline-form payload type will be
          // narrowed in a follow-up — for now this extra field is
          // accepted-and-ignored by the gate (it only acts when
          // CATEGORY_BY_KEY resolves the key form).
          category: 'chat',
        })
        .catch(() => 0);
    }

    return { ...inserted, sender: await this.fetchSenderView(userId) };
  }

  /**
   * P2-172 reconcile pre-read shared read-model (P2-230, run #154): ONE copy
   * of the sender-view lookup used by BOTH the gateway's pre-read ack path
   * (app.gateway.ts) and sendMessage's winner path — previously two inline
   * SELECTs had to stay in sync by hand. Returns the ORIGINAL row (with
   * sender view) when `clientMessageId` was already accepted, else null
   * (miss → caller falls through to the limiter / insert path).
   */
  async findReconcilableMessage(
    userId: string,
    conversationId: string,
    clientMessageId: string,
  ): Promise<PersonalMessage | null> {
    const existing = await this.db.query.personal_messages.findFirst({
      where: and(
        eq(personal_messages.sender_id, userId),
        eq(personal_messages.conversation_id, conversationId),
        eq(personal_messages.client_message_id, clientMessageId),
      ),
    });
    if (!existing) return null;
    return { ...existing, sender: await this.fetchSenderView(userId) };
  }

  /** Sender view ({ id, full_name, handle, avatar_url }) for message payloads. */
  private async fetchSenderView(userId: string) {
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
    return sender;
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
  total_count: number;
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
  total_count?: number;
}
