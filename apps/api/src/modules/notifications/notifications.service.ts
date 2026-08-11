import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { push_subscriptions, match_players } from '../../database/schema';

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
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  /**
   * Store a push subscription for a user.
   * Uses upsert on endpoint to handle re-subscriptions.
   */
  async subscribe(userId: string, sub: PushSubscriptionDto, userAgent?: string) {
    await this.db
      .insert(push_subscriptions)
      .values({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: [push_subscriptions.endpoint],
        set: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: userAgent ?? null,
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
}
