import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as webpush from 'web-push';
import * as Sentry from '@sentry/node';
import {
  normalizePushLocale,
  renderPushText,
  type PushKey,
  type PushLocale,
  type PushVars,
} from './push-text';
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
   * Get the distinct set of users on a match's roster (POTM push audience).
   * Delivery preferences (mute / quiet hours) are enforced downstream by
   * sendPushToUsers — do NOT re-join push_subscriptions here.
   */
  private async getMatchRosterUserIds(matchId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ user_id: match_players.user_id })
      .from(match_players)
      .where(eq(match_players.match_id, matchId));

    return rows.map((r) => r.user_id);
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
    payload:
      | { title: string; body: string; data: { type: string; matchId?: string; conversationId?: string } }
      // P2-8 (run #24): semantic-key form — text is rendered per-subscription
      // from push-text.ts using the subscription's stored locale.
      | { key: PushKey; vars?: PushVars; data: { type: string; matchId?: string; conversationId?: string } },
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

    // P2-8 (run #24, Reviewer A): fan out CONCURRENTLY — the old sequential
    // for-loop let one slow push endpoint stall every remaining delivery for
    // all callers. allSettled keeps per-sub pruning independent of siblings.
    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        // P1-20 delivery preferences.
        if (sub.push_muted) return;
        if (
          sub.quiet_enabled &&
          NotificationsService.isInQuietHours(now, sub.quiet_start, sub.quiet_end)
        ) {
          return;
        }
        // P1-5: per-subscription locale (deep-link +, since P2-8, push TEXT).
        const locale: PushLocale = normalizePushLocale(sub.locale);
        const title =
          'key' in payload ? renderPushText(payload.key, payload.vars ?? {}, locale).title : payload.title;
        const body =
          'key' in payload ? renderPushText(payload.key, payload.vars ?? {}, locale).body : payload.body;
        const body2 = JSON.stringify({
          title,
          body,
          data: { ...payload.data, locale },
        });
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body2,
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
          // Run #24 Reviewer-A: 5xx/timeout failures were invisible to
          // Sentry (debug log only) — a systemic endpoint outage would
          // produce zero signals while push silently stopped.
          //
          // Run #25 Reviewer-A refinement: only TRANSPORT-level failures
          // (5xx, or no statusCode at all = timeout/network) are captured.
          // Per-subscription 4xx (429 rate-limit, 400 bad payload) is
          // expected noise that would otherwise flood Sentry on a single
          // bad endpoint. The status_code tag keeps any 4xx spike
          // filterable from the debug log line above.
          if (statusCode === undefined || statusCode >= 500) {
            Sentry.captureException(err, {
              tags: {
                channel: 'web-push',
                endpoint_prefix: sub.endpoint.slice(0, 24),
                status_code: String(statusCode ?? 'timeout'),
              },
            });
          }
        }
      }),
    );

    // Never let an unexpected (non-send) failure crash a caller mid-fan-out.
    for (const r of results) {
      if (r.status === 'rejected') {
        this.logger.debug(`Push fan-out task failed: ${(r.reason as Error)?.message}`);
      }
    }
    return sent;
  }

  /**
   * Send a "Player of the Match decided" push notification to every attendee
   * of a match. Gracefully no-ops when VAPID keys are not configured (in-app
   * WebSocket broadcast still delivers the result to open clients).
   *
   * P2-27 (run #17): routes through sendPushToUsers so POTM pushes honor the
   * same per-user delivery preferences as every other push — push_muted users
   * are skipped, enabled quiet-hours windows (Riyadh-local) suppress delivery,
   * and each subscription's stored locale is injected (worker/index.js reads
   * data.locale for the deep-link; previously POTM deep-links always defaulted
   * to /en). The winner object lives in the WS broadcast payload, not here.
   */
  async sendPomDecidedNotification(
    matchId: string,
    payload: { matchId: string; winner: { id: string; fullName: string; avatarUrl: string | null }; voteCount: number },
  ): Promise<number> {
    if (!this.vapidConfigured) {
      return 0;
    }

    const userIds = await this.getMatchRosterUserIds(matchId);

    // P2-8 (run #24): semantic key — text localized per subscription locale.
    return this.sendPushToUsers(userIds, {
      key: 'pom_decided',
      vars: { winnerName: payload.winner.fullName },
      data: { type: 'pom-decided', matchId: payload.matchId },
    });
  }
}
