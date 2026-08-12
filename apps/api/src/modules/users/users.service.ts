import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql, and, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { users, match_players, match_votes, matches, match_reviews } from '../../database/schema';
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
        p.surface_type AS pitch_surface,
        COALESCE((SELECT mm.content FROM match_messages mm WHERE mm.match_id = m.id ORDER BY mm.created_at DESC LIMIT 1), '') AS last_message,
        v.name AS venue_name,
        v.city AS venue_city
      FROM match_players my
      INNER JOIN matches m ON m.id = my.match_id
      INNER JOIN users u ON u.id = m.host_id
      INNER JOIN pitches p ON p.id = m.pitch_id
      INNER JOIN venues v ON v.id = p.venue_id
      LEFT JOIN match_players mp2 ON mp2.match_id = m.id
      WHERE my.user_id = ${userId}
      GROUP BY m.id, u.id, p.id, v.id
      ORDER BY
        -- Upcoming/active matches first (scheduled today or later)
        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') AND m.scheduled_at >= date_trunc('day', NOW()) THEN 0
             WHEN m.status = 'Cancelled' THEN 1
             WHEN m.status = 'Completed' THEN 2
             ELSE 3 END,
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
      pitch_surface: string;
      last_message: string;
      venue_name: string;
      venue_city: string;
      pitch_surface?: string | null;
      last_message?: string | null;
    }>;
  }

  /**
   * Get unified discussions list — all matches the user is in, with
   * last message preview and unread count. Foundation for the Messages screen.
   */
  async getMyDiscussions(userId: string) {
    const rows = await this.db.execute(sql`
      SELECT
        m.id,
        'match'::text AS type,
        m.title,
        m.status,
        m.scheduled_at,
        u.full_name AS host_name,
        u.avatar_url AS host_avatar,
        (SELECT COUNT(*) FROM match_players mp2 WHERE mp2.match_id = m.id)::int AS participant_count,
        (SELECT mm.content FROM match_messages mm WHERE mm.match_id = m.id ORDER BY mm.created_at DESC LIMIT 1) AS last_message,
        (SELECT mm.created_at FROM match_messages mm WHERE mm.match_id = m.id ORDER BY mm.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT u2.full_name FROM match_messages mm INNER JOIN users u2 ON u2.id = mm.user_id WHERE mm.match_id = m.id ORDER BY mm.created_at DESC LIMIT 1) AS last_message_sender_name
      FROM match_players my
      INNER JOIN matches m ON m.id = my.match_id
      INNER JOIN users u ON u.id = m.host_id
      WHERE my.user_id = ${userId}
        AND m.status NOT IN ('Cancelled')
      ORDER BY
        COALESCE(
          (SELECT mm.created_at FROM match_messages mm WHERE mm.match_id = m.id ORDER BY mm.created_at DESC LIMIT 1),
          m.scheduled_at
        ) DESC
      LIMIT 30
    `);

    return {
      discussions: (rows as unknown as Array<{
        id: string;
        type: string;
        title: string;
        status: string;
        scheduled_at: Date;
        host_name: string | null;
        host_avatar: string | null;
        participant_count: number;
        last_message: string | null;
        last_message_at: Date | null;
        last_message_sender_name: string | null;
      }>).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        matchStatus: r.status,
        scheduledAt: r.scheduled_at,
        hostName: r.host_name,
        hostAvatar: r.host_avatar,
        participantCount: r.participant_count,
        lastMessage: r.last_message,
        lastMessageAt: r.last_message_at,
        lastMessageSenderName: r.last_message_sender_name,
        unreadCount: 0, // stub — future feature
      })),
      total: rows.length,
      hasMore: rows.length >= 30,
    };
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

    // Get review stats
    const [{ review_count, review_avg }] = await this.db
      .select({
        review_count: sql<number>`COUNT(*)::int`,
        review_avg: sql<number>`ROUND(AVG(${match_reviews.rating})::numeric, 1)`,
      })
      .from(match_reviews)
      .where(eq(match_reviews.reviewee_id, userId));

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
      review_count: review_count ?? 0,
      review_avg: review_avg ?? 0,
    };
  }

  /**
   * Search users by name or handle.
   */
  async searchUsers(query: string) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const q = `%${query.trim()}%`;
    return this.db
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
      .where(
        sql`(${users.full_name} ILIKE ${q} OR ${users.handle} ILIKE ${q})`,
      )
      .limit(20);
  }

  /**
   * Get reviews received by a user.
   */
  async getUserReviews(userId: string) {
    return this.db
      .select({
        id: match_reviews.id,
        rating: match_reviews.rating,
        comment: match_reviews.comment,
        created_at: match_reviews.created_at,
        reviewer: {
          id: users.id,
          full_name: users.full_name,
          avatar_url: users.avatar_url,
        },
        match: {
          id: matches.id,
          title: matches.title,
          scheduled_at: matches.scheduled_at,
        },
      })
      .from(match_reviews)
      .innerJoin(users, eq(users.id, match_reviews.reviewer_id))
      .innerJoin(matches, eq(matches.id, match_reviews.match_id))
      .where(eq(match_reviews.reviewee_id, userId))
      .orderBy(sql`${match_reviews.created_at} DESC`)
      .limit(20);
  }
}
