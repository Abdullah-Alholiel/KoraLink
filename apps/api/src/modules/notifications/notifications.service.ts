import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as webpush from 'web-push';
import * as schema from '../../database/schema';
import { push_subscriptions, match_players, users } from '../../database/schema';

type DB = PostgresJsDatabase<typeof schema>;

export interface PushSubscriptionDto {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private vapidConfigured = false;

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly config: ConfigService,
  ) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT', 'mailto:hello@koralink.sa');

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
    } else {
      this.logger.warn(
        'Web Push VAPID keys not configured — push notifications disabled. Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY.',
      );
    }
  }

  /**
   * Store a push subscription for a user.
   * Uses upsert on endpoint to handle re-subscriptions.
   */
  async subscribe(userId: string, sub: PushSubscriptionDto, userAgent?: string, locale = 'en') {
    await this.db
      .insert(push_subscriptions)
      .values({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent ?? null,
        locale,
      })
      .onConflictDoUpdate({
        target: [push_subscriptions.endpoint],
        set: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: userAgent ?? null,
          locale,
          updated_at: new Date(),
        },
      });

    return { subscribed: true };
  }

  /**
   * Remove a push subscription by endpoint.
   */
  async unsubscribe(userId: string, endpoint: string) {
    await this.db
      .delete(push_subscriptions)
      .where(
        and(
          eq(push_subscriptions.user_id, userId),
          eq(push_subscriptions.endpoint, endpoint),
        ),
      );

    return { unsubscribed: true };
  }

  /**
   * Get all subscriptions for a user (for sending notifications).
   */
  async getUserSubscriptions(userId: string) {
    return this.db
      .select({
        endpoint: push_subscriptions.endpoint,
        p256dh: push_subscriptions.p256dh,
        auth: push_subscriptions.auth,
      })
      .from(push_subscriptions)
      .where(eq(push_subscriptions.user_id, userId));
  }

  /**
   * Get subscriptions for all users in a match (for match-level notifications).
   */
  async getMatchSubscriptions(matchId: string) {
    const result = await this.db.execute(
      // Use raw SQL to join match_players + push_subscriptions
      sql`
        SELECT ps.endpoint, ps.p256dh, ps.auth
        FROM ${match_players} mp
        INNER JOIN ${push_subscriptions} ps ON ps.user_id = mp.user_id
        WHERE mp.match_id = ${matchId}
      `,
    );

    return result as unknown as Array<{
      endpoint: string;
      p256dh: string;
      auth: string;
    }>;
  }

  /**
   * Quiet-hours test (P1-20). Riyadh-local wall clock; supports windows that
   * wrap midnight (e.g. 23→07: quiet when hour >= 23 OR hour < 07) and
   * same-hour windows (start === end ⇒ always quiet).
   */
  static isInQuietHours(
    now: Date,
    startHour: number,
    endHour: number,
    timeZone = 'Asia/Riyadh',
  ): boolean {
    const hour = parseInt(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone,
      }).format(now),
      10,
    );
    if (startHour === endHour) return true;
    if (startHour < endHour) {
      return hour >= startHour && hour < endHour;
    }
    return hour >= startHour || hour < endHour; // wraps midnight
  }

  /**
   * Generic web-push to a list of users' subscribed devices (US10).
   * Gracefully no-ops when VAPID keys are not configured or the users have
   * no subscriptions. Invalid/expired subscriptions are pruned.
   *
   * P1-20: per-user delivery preferences are joined in and enforced —
   * `push_muted` silences a user entirely; an enabled quiet-hours window
   * (Riyadh-local, may wrap midnight) suppresses deliveries inside it.
   */
  async sendPushToUsers(
    userIds: string[],
    payload: { title: string; body: string; data: { type: string; matchId?: string; conversationId?: string } },
  ): Promise<number> {
    if (!this.vapidConfigured || userIds.length === 0) {
      return 0;
    }

    const subs = await this.db
      .select({
        endpoint: push_subscriptions.endpoint,
        p256dh: push_subscriptions.p256dh,
        auth: push_subscriptions.auth,
        locale: push_subscriptions.locale,
        push_muted: users.push_muted,
        quiet_enabled: users.quiet_hours_enabled,
        quiet_start: users.quiet_start_hour,
        quiet_end: users.quiet_end_hour,
      })
      .from(push_subscriptions)
      .innerJoin(users, eq(users.id, push_subscriptions.user_id))
      .where(inArray(push_subscriptions.user_id, userIds));

    const now = new Date();

    let sent = 0;

    for (const sub of subs) {
      // P1-20 delivery preferences.
      if (sub.push_muted) continue;
      if (
        sub.quiet_enabled &&
        NotificationsService.isInQuietHours(now, sub.quiet_start, sub.quiet_end)
      ) {
        continue;
      }
      try {
        // P1-5: per-subscription locale so the SW deep-link preserves ar/en.
        const locale = sub.locale || 'en';
        const body = JSON.stringify({
          ...payload,
          data: { ...payload.data, locale },
        });
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription no longer valid — prune it.
          await this.db
            .delete(push_subscriptions)
            .where(eq(push_subscriptions.endpoint, sub.endpoint));
        }
        this.logger.debug(
          `Push failed for ${sub.endpoint.slice(0, 20)}…: ${(err as Error).message}`,
        );
      }
    }
    return sent;
  }

  /**
   * Send a "Player of the Match decided" push notification to every
   * attendee of a match. Gracefully no-ops when VAPID keys are not configured
   * (in-app WebSocket broadcast still delivers the result to open clients).
   */
  async sendPomDecidedNotification(
    matchId: string,
    payload: { matchId: string; winner: { id: string; fullName: string; avatarUrl: string | null }; voteCount: number },
  ): Promise<number> {
    if (!this.vapidConfigured) {
      return 0;
    }

    const subs = await this.getMatchSubscriptions(matchId);
    let sent = 0;

    const body = JSON.stringify({
      title: '🏆 Player of the Match',
      body: `${payload.winner.fullName} was voted Player of the Match!`,
      data: { type: 'pom-decided', matchId: payload.matchId, winnerId: payload.winner.id },
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        sent += 1;
      } catch (err) {
        // Invalid/expired subscription — ignore and continue.
        this.logger.debug(`Push failed for ${sub.endpoint.slice(0, 20)}…: ${(err as Error).message}`);
      }
    }

    return sent;
  }
}
