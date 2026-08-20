import { Injectable, Inject, Optional, forwardRef } from '@nestjs/common';
import { eq, inArray, and, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import {
  activities,
  feed_items,
  follows,
  users,
  matches,
  pitches,
  venues,
} from '../../database/schema';
import { RealtimeService } from '../gateway/realtime.service';

type DB = PostgresJsDatabase<typeof schema>;

export type ActivityVerb =
  | 'created_match'
  | 'joined_match'
  | 'followed'
  | 'messaged'
  | 'pom_decided'
  // ── Admin→player (ops console actions) ──
  | 'dispute_resolved'
  | 'dispute_rejected'
  | 'wallet_refunded'
  | 'match_cancelled_admin'
  | 'account_suspended'
  | 'account_banned'
  | 'no_show_marked';

/** Verbs that appear in the bell (directed notifications), not just the feed. */
const DIRECTED_VERBS = [
  'followed',
  'messaged',
  'pom_decided',
  'dispute_resolved',
  'dispute_rejected',
  'wallet_refunded',
  'match_cancelled_admin',
  'account_suspended',
  'account_banned',
  'no_show_marked',
] as const;

/** Raw SQL list for `verb = ANY(...)` filters below (compile-time constant — no injection). */
const DIRECTED_VERBS_SQL = `ARRAY['${DIRECTED_VERBS.join("','")}']::"ActivityVerb"[]`;

interface RecordParams {
  actorId: string;
  verb: ActivityVerb;
  matchId?: string;
  subjectId?: string;
  recipients: string[];
  /** When true (default), the actor is excluded from their own feed item. */
  excludeActor?: boolean;
}

export interface FeedItem {
  id: string;
  verb: ActivityVerb;
  actor: { id: string; name: string; handle: string | null; avatarUrl: string | null };
  match: { id: string; title: string; venueName: string | null; scheduledAt: Date | null } | null;
  subjectUserId: string | null;
  isRead: boolean;
  createdAt: Date;
}

@Injectable()
export class ActivitiesService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    @Optional() @Inject(forwardRef(() => RealtimeService))
    private readonly realtime?: RealtimeService,
  ) {}

  /**
   * Single choke point for recording an activity and fanning it out to
   * recipients' feed items (fan-out on write — fast reads at scale).
   * Deduplicates recipients and excludes the actor. No-ops when empty.
   * Also emits a `notification` WS event to each recipient's personal room.
   */
  async record(params: RecordParams): Promise<void> {
    const { excludeActor = true } = params;
    const recipients = [...new Set(params.recipients)].filter(
      (r) => r && (excludeActor ? r !== params.actorId : true),
    );
    if (recipients.length === 0) return;

    const [activity] = await this.db
      .insert(activities)
      .values({
        actor_id: params.actorId,
        verb: params.verb,
        match_id: params.matchId ?? null,
        subject_id: params.subjectId ?? null,
      })
      .returning({ id: activities.id, created_at: activities.created_at });

    await this.db.insert(feed_items).values(
      recipients.map((recipientId) => ({
        recipient_id: recipientId,
        activity_id: activity.id,
      })),
    );

    // Real-time fan-out: push a notification event to each recipient.
    // Fire-and-forget — delivery failure never breaks the recording.
    try {
      await this.emitNotifications(recipients, {
        id: activity.id,
        verb: params.verb,
        createdAt: activity.created_at,
        actorId: params.actorId,
        matchId: params.matchId ?? null,
      });
    } catch {
      // swallow — WS is best-effort
    }
  }

  /** Push `notification` + authoritative unread count to user rooms. */
  private async emitNotifications(
    recipients: string[],
    base: { id: string; verb: ActivityVerb; createdAt: Date; actorId: string; matchId: string | null },
  ): Promise<void> {
    if (!this.realtime) return;

    const [actor] = await this.db
      .select({
        id: users.id,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
      })
      .from(users)
      .where(eq(users.id, base.actorId))
      .limit(1);

    const unreadCounts = await this.db
      .select({
        recipient_id: feed_items.recipient_id,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(feed_items)
      .where(
        and(
          inArray(feed_items.recipient_id, recipients),
          eq(feed_items.is_read, false),
        ),
      )
      .groupBy(feed_items.recipient_id);

    const byUser = new Map(unreadCounts.map((r) => [r.recipient_id, r.count]));
    for (const userId of recipients) {
      this.realtime.emitToUser(userId, 'notification', {
        id: base.id,
        verb: base.verb,
        createdAt: base.createdAt,
        actor: actor
          ? { id: actor.id, name: actor.full_name, avatarUrl: actor.avatar_url }
          : null,
        matchId: base.matchId,
        unreadCount: byUser.get(userId) ?? 0,
      });
    }
  }

  /** Unread DIRECTED notification count (drives the bell badge). */
  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [row] = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM ${feed_items} fi
      INNER JOIN ${activities} a ON a.id = fi.activity_id
      LEFT JOIN ${matches} m ON m.id = a.match_id
      WHERE fi.recipient_id = ${userId}::text
        AND fi.is_read = FALSE
        AND (
          a.verb = ANY(${sql.raw(DIRECTED_VERBS_SQL)})
          OR (a.verb = 'joined_match' AND m.host_id = ${userId}::text)
        )
    `)) as unknown as Array<{ n: number }>;
    return row?.n ?? 0;
  }

  async getFeed(userId: string, page = 1, perPage = 20) {
    return this.queryFeed(userId, 'all', page, perPage);
  }

  async getNotifications(userId: string, page = 1, perPage = 20) {
    return this.queryFeed(userId, 'directed', page, perPage);
  }

  private async queryFeed(
    userId: string,
    filter: 'all' | 'directed',
    page: number,
    perPage: number,
  ) {
    const offset = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, perPage));

    const directedClause =
      filter === 'directed'
        ? sql`AND (
            a.verb = ANY(${sql.raw(DIRECTED_VERBS_SQL)})
            OR (a.verb = 'joined_match' AND m.host_id = ${userId}::text)
          )`
        : sql``;

    const rows = await this.db.execute(sql`
      SELECT
        fi.id,
        fi.is_read,
        a.id      AS activity_id,
        a.verb,
        a.match_id,
        a.subject_id,
        a.created_at,
        u.id      AS actor_id,
        u.full_name   AS actor_name,
        u.handle      AS actor_handle,
        u.avatar_url  AS actor_avatar,
        m.id      AS m_match_id,
        m.title   AS match_title,
        m.scheduled_at AS match_scheduled_at,
        v.name    AS match_venue_name
      FROM ${feed_items} fi
      INNER JOIN ${activities} a ON a.id = fi.activity_id
      INNER JOIN ${users} u ON u.id = a.actor_id
      LEFT JOIN ${matches} m ON m.id = a.match_id
      LEFT JOIN ${pitches} p ON p.id = m.pitch_id
      LEFT JOIN ${venues} v ON v.id = p.venue_id
      WHERE fi.recipient_id = ${userId}::text
        ${directedClause}
      ORDER BY
        (
          3.0 * exp(-1.0 * EXTRACT(EPOCH FROM (NOW() - a.created_at)) / 86400.0)
          + CASE
              WHEN a.verb = ANY(${sql.raw(DIRECTED_VERBS_SQL)}) THEN 3.0
              WHEN a.verb = 'joined_match' AND m.host_id = ${userId}::text THEN 3.0
              WHEN EXISTS (
                SELECT 1 FROM ${follows} f
                WHERE f.follower_id = ${userId}::text AND f.following_id = a.actor_id
              ) THEN 2.0
              ELSE 1.0
            END
        ) DESC,
        a.created_at DESC
      LIMIT ${Math.min(100, Math.max(1, perPage))} OFFSET ${offset}
    `);

    const [countRow] = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM ${feed_items} fi
      INNER JOIN ${activities} a ON a.id = fi.activity_id
      LEFT JOIN ${matches} m ON m.id = a.match_id
      WHERE fi.recipient_id = ${userId}::text
        ${directedClause}
    `)) as unknown as Array<{ total: number }>;

    const items = (rows as unknown as RawFeedRow[]).map((r) => this.mapRow(r));
    const total = countRow?.total ?? 0;

    return { items, total, hasMore: offset + items.length < total };
  }

  async markRead(userId: string, ids?: string[]): Promise<{ updated: number }> {
    const base = ids && ids.length > 0
      ? and(eq(feed_items.recipient_id, userId), inArray(feed_items.id, ids))
      : eq(feed_items.recipient_id, userId);

    const rows = await this.db
      .update(feed_items)
      .set({ is_read: true })
      .where(base)
      .returning({ id: feed_items.id });

    // Converge badges on every connected device of this user.
    const unreadCount = await this.getUnreadNotificationCount(userId);
    this.realtime?.emitToUser(userId, 'badge-sync', { unreadCount });

    return { updated: rows.length };
  }

  private mapRow(r: RawFeedRow): FeedItem {
    return {
      id: r.id,
      verb: r.verb,
      actor: {
        id: r.actor_id,
        name: r.actor_name ?? 'Unknown',
        handle: r.actor_handle,
        avatarUrl: r.actor_avatar,
      },
      match: r.m_match_id
        ? {
            id: r.m_match_id,
            title: r.match_title ?? '',
            venueName: r.match_venue_name,
            scheduledAt: r.match_scheduled_at,
          }
        : null,
      subjectUserId: r.subject_id,
      isRead: r.is_read,
      createdAt: r.created_at,
    };
  }
}

interface RawFeedRow {
  id: string;
  is_read: boolean;
  activity_id: string;
  verb: ActivityVerb;
  match_id: string | null;
  subject_id: string | null;
  created_at: Date;
  actor_id: string;
  actor_name: string | null;
  actor_handle: string | null;
  actor_avatar: string | null;
  m_match_id: string | null;
  match_title: string | null;
  match_scheduled_at: Date | null;
  match_venue_name: string | null;
}
