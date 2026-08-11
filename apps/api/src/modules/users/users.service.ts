import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql, and, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { users, match_players, match_votes, matches } from '../../database/schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { withTimestamp } from '../../common/utils/timestamp';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class UsersService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  /**
   * Count how many times a user won Player of the Match.
   * A "win" = the user was the candidate with the most votes in a completed
   * match where votes are closed (completed_at + 24h < now).
   */
  private async getPomCount(userId: string): Promise<number> {
    // Find completed matches where voting window has closed, and the user
    // had the most votes (no tie at top).
    const result = await this.db.execute(sql`
      WITH closed_matches AS (
        SELECT m.id
        FROM ${matches} m
        WHERE m.status = 'Completed'
          AND m.completed_at IS NOT NULL
          AND m.completed_at + INTERVAL '24 hours' < NOW()
      ),
      vote_winners AS (
        SELECT
          mv.match_id,
          mv.candidate_id,
          COUNT(*)::int AS vc,
          RANK() OVER (PARTITION BY mv.match_id ORDER BY COUNT(*) DESC) AS rnk
        FROM ${match_votes} mv
        INNER JOIN closed_matches cm ON cm.id = mv.match_id
        GROUP BY mv.match_id, mv.candidate_id
      )
      SELECT COUNT(*)::int AS pom_count
      FROM vote_winners vw
      WHERE vw.rnk = 1
        AND vw.candidate_id = ${userId}
        AND vw.vc > 0
        -- Exclude ties: ensure no other candidate has same count at rank 1
        AND NOT EXISTS (
          SELECT 1 FROM vote_winners vw2
          WHERE vw2.match_id = vw.match_id
            AND vw2.rnk = 1
            AND vw2.candidate_id != vw.candidate_id
        )
    `);

    return (result[0] as { pom_count: number })?.pom_count ?? 0;
  }

  /**
   * Get the authenticated user's profile including stats.
   */
  async getProfile(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        phone: true,
        full_name: true,
        handle: true,
        avatar_url: true,
        preferred_location: true,
        preferred_position: true,
        skill_level: true,
        role: true,
        wallet_balance: true,
        karma_score: true,
        rating: true,
        no_show_count: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const pom_count = await this.getPomCount(userId);

    return { ...user, pom_count };
  }

  /**
   * Get the authenticated user's stats summary.
   */
  async getStats(userId: string) {
    const [user] = await this.db
      .select({
        rating: users.rating,
        karma_score: users.karma_score,
        no_show_count: users.no_show_count,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(match_players)
      .where(eq(match_players.user_id, userId));

    return {
      games_played: count,
      rating: user.rating,
      karma_score: user.karma_score,
      no_show_count: user.no_show_count,
    };
  }

  /**
   * Get the list of matches the user has joined (for Active Discussions).
   */
  async getMyMatches(userId: string) {
    const rows = await this.db.execute(sql`
      SELECT
        m.id,
        m.title,
        m.match_type,
        m.gender_rule,
        m.status,
        m.scheduled_at,
        m.duration_mins,
        m.max_players,
        m.price_per_player::float AS price_per_player,
        COUNT(mp2.id)::int AS spots_filled,
        NULL::float8 AS distance_m,
        TRUE AS is_joined,
        u.id AS host_id,
        u.full_name AS host_name,
        u.avatar_url AS host_avatar,
        p.id AS pitch_id,
        p.name AS pitch_name,
        p.size AS pitch_size,
        v.name AS venue_name,
        v.city AS venue_city
      FROM match_players my
      INNER JOIN matches m ON m.id = my.match_id
      INNER JOIN users u ON u.id = m.host_id
      INNER JOIN pitches p ON p.id = m.pitch_id
      INNER JOIN venues v ON v.id = p.venue_id
      LEFT JOIN match_players mp2 ON mp2.match_id = m.id
      WHERE my.user_id = ${userId}
        AND m.status != 'Cancelled'
      GROUP BY m.id, u.id, p.id, v.id
      ORDER BY
        -- Upcoming/active matches first (scheduled today or later)
        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') AND m.scheduled_at >= date_trunc('day', NOW()) THEN 0
             WHEN m.status = 'Completed' THEN 1
             ELSE 2 END,
        -- Upcoming: soonest first
        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') AND m.scheduled_at >= date_trunc('day', NOW()) THEN m.scheduled_at END ASC,
        -- Past: most recent first
        m.scheduled_at DESC
      LIMIT 50
    `);

    return rows as unknown as Array<{
      id: string;
      title: string;
      match_type: string;
      gender_rule: string;
      status: string;
      scheduled_at: Date;
      duration_mins: number;
      max_players: number;
      price_per_player: number;
      spots_filled: number;
      distance_m: number | null;
      host_id: string;
      host_name: string | null;
      host_avatar: string | null;
      pitch_id: string;
      pitch_name: string;
      venue_name: string;
      venue_city: string;
    }>;
  }

  /**
   * Update the authenticated user's profile fields.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const [updated] = await this.db
      .update(users)
      .set(withTimestamp({ ...dto }))
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        phone: users.phone,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        preferred_location: users.preferred_location,
        preferred_position: users.preferred_position,
        skill_level: users.skill_level,
        role: users.role,
      });

    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    return updated;
  }

  /**
   * Get a public user profile by ID — visible to any authenticated user.
   */
  async getPublicProfile(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        preferred_position: users.preferred_position,
        skill_level: users.skill_level,
        rating: users.rating,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const pom_count = await this.getPomCount(userId);

    const [{ games_played }] = await this.db
      .select({ games_played: sql<number>`COUNT(*)::int` })
      .from(match_players)
      .where(eq(match_players.user_id, userId));

    return {
      id: user.id,
      full_name: user.full_name,
      handle: user.handle,
      avatar_url: user.avatar_url,
      preferred_position: user.preferred_position,
      skill_level: user.skill_level,
      rating: user.rating,
      pom_count,
      games_played,
    };
  }
}
