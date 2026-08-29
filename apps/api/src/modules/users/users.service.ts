import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql, and, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { users, match_players, match_votes, matches, follows } from '../../database/schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePushPreferencesDto } from './dto/update-push-preferences.dto';
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
        INNER JOIN ${match_players} mp
          ON mp.match_id = mv.match_id
         AND mp.user_id = mv.candidate_id
         AND mp.no_show = false
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
        no_show_count: true,
        home_lat: true,
        home_lng: true,
        push_muted: true,
        quiet_hours_enabled: true,
        quiet_start_hour: true,
        quiet_end_hour: true,
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
        EXISTS(SELECT 1 FROM match_votes mv WHERE mv.match_id = m.id AND mv.voter_id = ${userId}::text) AS has_voted,
        m.visibility AS visibility,
        v.name AS venue_name,
        v.city AS venue_city,
        COALESCE(m.completed_at, m.scheduled_at + (COALESCE(m.duration_mins, 60) * INTERVAL '1 minute')) + INTERVAL '24 hours' AS voting_closes_at
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
      visibility: 'public' | 'private';
      pitch_id: string;
      pitch_name: string;
      pitch_surface: string;
      last_message: string;
      has_voted: boolean;
      venue_name: string;
      venue_city: string;
      voting_closes_at: Date;
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
        home_lat: users.home_lat,
        home_lng: users.home_lng,
      });

    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    return updated;
  }

  /**
   * Update the authenticated user's push delivery preferences
   * (P1-20, run #13). Only the provided fields change. Returns the full
   * preference set so the client can reconcile its UI in one round-trip.
   */
  async updatePushPreferences(
    userId: string,
    dto: UpdatePushPreferencesDto,
  ) {
    const set: Record<string, unknown> = {};
    if (dto.pushMuted !== undefined) set.push_muted = dto.pushMuted;
    if (dto.quietHoursEnabled !== undefined)
      set.quiet_hours_enabled = dto.quietHoursEnabled;
    if (dto.quietStartHour !== undefined)
      set.quiet_start_hour = dto.quietStartHour;
    if (dto.quietEndHour !== undefined) set.quiet_end_hour = dto.quietEndHour;

    if (Object.keys(set).length > 0) {
      await this.db
        .update(users)
        .set(withTimestamp(set))
        .where(eq(users.id, userId));
    }

    const [prefs] = await this.db
      .select({
        push_muted: users.push_muted,
        quiet_hours_enabled: users.quiet_hours_enabled,
        quiet_start_hour: users.quiet_start_hour,
        quiet_end_hour: users.quiet_end_hour,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!prefs) {
      throw new NotFoundException('User not found.');
    }

    return prefs;
  }

  /**
   * Get a public user profile by ID — visible to any authenticated user.
   */
  async getPublicProfile(userId: string, currentUserId?: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        preferred_position: users.preferred_position,
        skill_level: users.skill_level,
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

    const [counts] = (await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM ${follows} WHERE following_id = ${userId}::text) AS followers_count,
        (SELECT COUNT(*)::int FROM ${follows} WHERE follower_id = ${userId}::text) AS following_count
    `)) as unknown as Array<{ followers_count: number; following_count: number }>;

    let isFollowing = false;
    if (currentUserId) {
      const [followRow] = await this.db
        .select({ id: follows.id })
        .from(follows)
        .where(and(eq(follows.follower_id, currentUserId), eq(follows.following_id, userId)))
        .limit(1);
      isFollowing = !!followRow;
    }

    return {
      id: user.id,
      full_name: user.full_name,
      handle: user.handle,
      avatar_url: user.avatar_url,
      preferred_position: user.preferred_position,
      skill_level: user.skill_level,
      pom_count,
      games_played,
      isFollowing,
      followersCount: counts?.followers_count ?? 0,
      followingCount: counts?.following_count ?? 0,
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
      })
      .from(users)
      .where(
        sql`(${users.full_name} ILIKE ${q} OR ${users.handle} ILIKE ${q})`,
      )
      .limit(20);
  }
}
