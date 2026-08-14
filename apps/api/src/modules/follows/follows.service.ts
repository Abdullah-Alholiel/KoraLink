import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { follows, users } from '../../database/schema';
import { ActivitiesService } from '../activities/activities.service';

type DB = PostgresJsDatabase<typeof schema>;

export interface UserSummary {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  preferred_position: string | null;
  skill_level: string | null;
}

export interface FollowState {
  following: boolean;
  followersCount: number;
  followingCount: number;
}

@Injectable()
export class FollowsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async follow(currentUserId: string, targetUserId: string): Promise<FollowState> {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('You cannot follow yourself.');
    }

    await this.db
      .insert(follows)
      .values({ follower_id: currentUserId, following_id: targetUserId })
      .onConflictDoNothing({ target: [follows.follower_id, follows.following_id] });

    // Fan out a "followed" activity to the followee (fire-and-forget).
    this.activitiesService
      .record({
        actorId: currentUserId,
        verb: 'followed',
        subjectId: targetUserId,
        recipients: [targetUserId],
      })
      .catch(() => undefined);

    return this.followState(currentUserId, targetUserId);
  }

  async unfollow(currentUserId: string, targetUserId: string): Promise<FollowState> {
    await this.db
      .delete(follows)
      .where(
        and(
          eq(follows.follower_id, currentUserId),
          eq(follows.following_id, targetUserId),
        ),
      );

    return this.followState(currentUserId, targetUserId);
  }

  async getFollowers(userId: string): Promise<{ users: UserSummary[]; total: number }> {
    const rows = (await this.db.execute(sql`
      SELECT
        u.id, u.full_name, u.handle, u.avatar_url, u.preferred_position, u.skill_level
      FROM ${follows} f
      INNER JOIN ${users} u ON u.id = f.follower_id
      WHERE f.following_id = ${userId}::text
      ORDER BY f.created_at DESC
      LIMIT 100
    `)) as unknown as UserSummary[];

    return { users: rows, total: rows.length };
  }

  async getFollowing(userId: string): Promise<{ users: UserSummary[]; total: number }> {
    const rows = (await this.db.execute(sql`
      SELECT
        u.id, u.full_name, u.handle, u.avatar_url, u.preferred_position, u.skill_level
      FROM ${follows} f
      INNER JOIN ${users} u ON u.id = f.following_id
      WHERE f.follower_id = ${userId}::text
      ORDER BY f.created_at DESC
      LIMIT 100
    `)) as unknown as UserSummary[];

    return { users: rows, total: rows.length };
  }

  async getCounts(userId: string): Promise<{ followersCount: number; followingCount: number }> {
    const [counts] = (await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM ${follows} WHERE following_id = ${userId}::text) AS followers_count,
        (SELECT COUNT(*)::int FROM ${follows} WHERE follower_id = ${userId}::text) AS following_count
    `)) as unknown as Array<{ followers_count: number; following_count: number }>;

    return {
      followersCount: counts?.followers_count ?? 0,
      followingCount: counts?.following_count ?? 0,
    };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: follows.id })
      .from(follows)
      .where(
        and(
          eq(follows.follower_id, followerId),
          eq(follows.following_id, followingId),
        ),
      )
      .limit(1);

    return !!row;
  }

  private async followState(
    followerId: string,
    followingId: string,
  ): Promise<FollowState> {
    const following = await this.isFollowing(followerId, followingId);
    const counts = await this.getCounts(followingId);
    return { following, ...counts };
  }
}
