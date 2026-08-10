import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { users, match_players } from '../../database/schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { withTimestamp } from '../../common/utils/timestamp';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class UsersService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

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

    return user;
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
        COUNT(mp2.id) FILTER (WHERE mp2.is_host = false)::int AS spots_filled,
        NULL::float8 AS distance_m,
        TRUE AS is_joined,
        u.id AS host_id,
        u.full_name AS host_name,
        u.avatar_url AS host_avatar,
        p.id AS pitch_id,
        p.name AS pitch_name,
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
        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') THEN 0 ELSE 1 END,
        CASE WHEN m.status IN ('Open', 'Full', 'InProgress') THEN m.scheduled_at END ASC,
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
}
