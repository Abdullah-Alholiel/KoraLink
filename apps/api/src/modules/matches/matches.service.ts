import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches, match_messages, match_players, match_votes, users } from '../../database/schema';
import { GetMatchesDto } from './dto/get-matches.dto';
import { withTimestamp } from '../../common/utils/timestamp';

/** Margin added on top of the raw pitch cost per player (SAR). */
const PLATFORM_MARGIN_SAR = 5;

export interface NearbyMatchRow {
  id: string;
  title: string;
  match_type: string;
  gender_rule: string;
  status: string;
  scheduled_at: Date;
  duration_mins: number;
  price_per_player: number;
  max_players: number;
  spots_filled: number;
  distance_m: number;
  host_id: string;
  host_name: string | null;
  host_avatar: string | null;
  pitch_id: string;
  pitch_name: string;
  venue_name: string;
  venue_city: string;
  is_joined: boolean;
}

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class MatchesService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Discovery feed — PostGIS ST_DWithin geo-filter
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns open matches within `radius_km` of the given coordinates,
   * optionally filtered by date.
   *
   * Uses Drizzle's `sql` template tag for raw PostGIS function calls so the
   * ORM does not need to understand the `geography` column type.
   *
   * ST_DWithin implementation:
   *   ST_DWithin(m.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radiusMetres)
   * returns true when the great-circle distance (metres) is within the radius.
   */
  async findNearby(dto: GetMatchesDto, currentUserId?: string): Promise<NearbyMatchRow[]> {
    const { lat, lng, radius_km = 10, date } = dto;

    if ((lat === undefined) !== (lng === undefined)) {
      throw new BadRequestException('Both lat and lng must be provided together.');
    }

    const radiusMetres = radius_km * 1000;
    const hasCoords = lat !== undefined && lng !== undefined;

    // ── Date window filter ─────────────────────────────────────────────────
    const dateClause = date
      ? sql`AND m.scheduled_at::date = ${date}::date`
      : sql``;

    // ── Geo filter ─────────────────────────────────────────────────────────
    // ST_DWithin on the denormalised `location` geography column.
    // Great-circle distance in metres is used for the radius check.
    const geoClause = hasCoords
      ? sql`
          AND ST_DWithin(
            m.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusMetres}
          )`
      : sql``;

    // ── Distance expression ────────────────────────────────────────────────
    const distanceExpr = hasCoords
      ? sql`ST_Distance(
            m.location,
            ST_SetSRID(ST_MakePoint(${lng ?? 0}, ${lat ?? 0}), 4326)::geography
          )`
      : sql`NULL`;

    // db.execute returns rows typed as Record<string,unknown>[] for raw SQL;
    // the SELECT list is fixed, so the cast to NearbyMatchRow[] is safe here.
    const rows = await this.db.execute(sql`
      SELECT
        m.id,
        m.title,
        m.match_type,
        m.gender_rule,
        m.status,
        m.scheduled_at,
        m.duration_mins,
        m.price_per_player::float AS price_per_player,
        m.max_players,
        COUNT(mp.id) FILTER (WHERE mp.is_host = false)::int         AS spots_filled,
        ${distanceExpr}           AS distance_m,
        u.id                      AS host_id,
        u.full_name               AS host_name,
        u.avatar_url              AS host_avatar,
        p.id                      AS pitch_id,
        p.name                    AS pitch_name,
        v.name                    AS venue_name,
        v.city                    AS venue_city,
        COALESCE(BOOL_OR(mp.user_id = ${currentUserId}::text), FALSE) AS is_joined
      FROM matches m
      INNER JOIN users   u  ON u.id  = m.host_id
      INNER JOIN pitches p  ON p.id  = m.pitch_id
      INNER JOIN venues  v  ON v.id  = p.venue_id
      LEFT  JOIN match_players mp ON mp.match_id = m.id
      WHERE m.status = 'Open'
        AND m.scheduled_at >= NOW()
        ${geoClause}
        ${dateClause}
      GROUP BY m.id, u.id, p.id, v.id
      ORDER BY m.scheduled_at ASC
      LIMIT 50
    `);

    return rows as unknown as NearbyMatchRow[];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Match Engine — price calculation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calculates the price per player.
   *
   * Formula: (pitchCost / (players - 1)) + platformMargin
   *
   * @param pitchCostSar  Total hourly pitch rental cost in SAR.
   * @param players       Expected number of players (must be ≥ 2).
   */
  calculatePricePerPlayer(pitchCostSar: number, players: number): number {
    if (players < 2) {
      throw new BadRequestException('A match requires at least 2 players.');
    }
    const raw = pitchCostSar / (players - 1) + PLATFORM_MARGIN_SAR;
    return Math.ceil(raw * 100) / 100; // round up to 2 d.p.
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Single match detail (with relations)
  // ─────────────────────────────────────────────────────────────────────────

  async findOne(matchId: string) {
    const match = await this.db.query.matches.findFirst({
      where: eq(matches.id, matchId),
      with: {
        host: {
          columns: {
            id: true,
            full_name: true,
            handle: true,
            avatar_url: true,
            rating: true,
            karma_score: true,
          },
        },
        pitch: {
          with: {
            venue: {
              columns: {
                name: true,
                city: true,
                address: true,
                amenities: true,
              },
            },
          },
        },
        players: {
          with: {
            user: {
              columns: {
                id: true,
                full_name: true,
                handle: true,
                avatar_url: true,
                rating: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    return match;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Join a match (add player to roster)
  // ─────────────────────────────────────────────────────────────────────────

  async joinMatch(userId: string, matchId: string) {
    await this.db.transaction(async (tx) => {
      // 1. Verify match exists and is Open
      const [match] = await tx
        .select({
          id: matches.id,
          status: matches.status,
          max_players: matches.max_players,
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }

      if (match.status !== 'Open') {
        throw new BadRequestException('This match is no longer open for joining.');
      }

      // 2. Check user is not already in match_players
      const [existing] = await tx
        .select({ id: schema.match_players.id })
        .from(schema.match_players)
        .where(
          sql`${schema.match_players.match_id} = ${matchId} AND ${schema.match_players.user_id} = ${userId}`,
        )
        .limit(1);

      if (existing) {
        throw new BadRequestException('You have already joined this match.');
      }

      // 3. Check spots available
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.match_players)
        .where(eq(schema.match_players.match_id, matchId));

      if (count >= match.max_players) {
        throw new BadRequestException('Match is full.');
      }

      // 4. Auto-assign team: alternate Home/Away so players fill evenly.
      //    Host is always 'Home'. Joiners go to the team with fewer players.
      const [{ homeCount }] = await tx
        .select({ homeCount: sql<number>`count(*)::int` })
        .from(schema.match_players)
        .where(
          sql`${schema.match_players.match_id} = ${matchId} AND ${schema.match_players.team} = 'Home'`,
        );
      const [{ awayCount }] = await tx
        .select({ awayCount: sql<number>`count(*)::int` })
        .from(schema.match_players)
        .where(
          sql`${schema.match_players.match_id} = ${matchId} AND ${schema.match_players.team} = 'Away'`,
        );

      const assignedTeam = homeCount <= awayCount ? 'Home' : 'Away';

      // 5. Insert match_players row with team assignment
      await tx
        .insert(schema.match_players)
        .values({
          match_id: matchId,
          user_id: userId,
          is_host: false,
          team: assignedTeam,
          no_show: false,
        });

      // 6. If last spot, mark Full
      if (count + 1 >= match.max_players) {
        await tx
          .update(matches)
          .set(withTimestamp({ status: 'Full' }))
          .where(eq(matches.id, matchId));
      }
    });

    // Return fully populated match with relations (API Contract Rule §2)
    return this.findOne(matchId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Leave a match (remove player from roster)
  // ─────────────────────────────────────────────────────────────────────────

  async leaveMatch(userId: string, matchId: string) {
    await this.db.transaction(async (tx) => {
      // 1. Verify user is in the match
      const [membership] = await tx
        .select({
          id: schema.match_players.id,
          is_host: schema.match_players.is_host,
        })
        .from(schema.match_players)
        .where(
          sql`${schema.match_players.match_id} = ${matchId} AND ${schema.match_players.user_id} = ${userId}`,
        )
        .limit(1);

      if (!membership) {
        throw new BadRequestException('You are not a member of this match.');
      }

      if (membership.is_host) {
        throw new BadRequestException(
          'Host cannot leave the match. Cancel the match instead.',
        );
      }

      // 2. Remove from match_players
      await tx
        .delete(schema.match_players)
        .where(
          sql`${schema.match_players.match_id} = ${matchId} AND ${schema.match_players.user_id} = ${userId}`,
        );

      // 3. If match was Full, revert to Open
      const [match] = await tx
        .select({ status: matches.status })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (match?.status === 'Full') {
        await tx
          .update(matches)
          .set(withTimestamp({ status: 'Open' }))
          .where(eq(matches.id, matchId));
      }
    });

    // Return fully populated match with relations (API Contract Rule §2)
    return this.findOne(matchId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Create a new match (host)
  // ─────────────────────────────────────────────────────────────────────────

  async createMatch(
    hostId: string,
    dto: {
      pitch_id: string;
      title: string;
      match_type: typeof schema.matchTypeEnum.enumValues[number];
      gender_rule: typeof schema.genderRuleEnum.enumValues[number];
      scheduled_at: string;
      duration_mins: number;
      max_players: number;
      pitchCostSar: number;
    },
  ) {
    // Validate pitch exists and fetch venue location for geo-discovery
    const [pitch] = await this.db
      .select({
        id: schema.pitches.id,
        venueLocation: schema.venues.location,
      })
      .from(schema.pitches)
      .innerJoin(schema.venues, eq(schema.pitches.venue_id, schema.venues.id))
      .where(eq(schema.pitches.id, dto.pitch_id))
      .limit(1);

    if (!pitch) {
      throw new NotFoundException(`Pitch ${dto.pitch_id} not found.`);
    }

    const pricePerPlayer = this.calculatePricePerPlayer(
      dto.pitchCostSar,
      dto.max_players,
    );

    const created = await this.db.transaction(async (tx) => {
      // 1. Create the match
      const [match] = await tx
        .insert(matches)
        .values({
          host_id: hostId,
          pitch_id: dto.pitch_id,
          title: dto.title,
          match_type: dto.match_type,
          gender_rule: dto.gender_rule,
          scheduled_at: new Date(dto.scheduled_at),
          duration_mins: dto.duration_mins,
          price_per_player: pricePerPlayer.toString(),
          max_players: dto.max_players,
          status: 'Open',
          // Inherit venue location so geo-discovery works for user-created matches
          ...(pitch.venueLocation ? { location: pitch.venueLocation } : {}),
        })
        .returning();

      // 2. Add host to match_players
      await tx.insert(schema.match_players).values({
        match_id: match.id,
        user_id: hostId,
        is_host: true,
        team: 'Home',
      });

      return match;
    });

    // Fetch complete match with host relation so the frontend gets full_name etc.
    return this.findOne(created.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Match chat history (REST complement to the WebSocket gateway)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns recent chat messages for a match, newest last.
   * Complements the gateway's real-time `new-message` events with history
   * for initial render and offline caching.
   */
  async getMessages(matchId: string) {
    const messages = await this.db.query.match_messages.findMany({
      where: eq(match_messages.match_id, matchId),
      orderBy: (msg, { asc }) => [asc(msg.created_at)],
      limit: 50,
      with: {
        user: {
          columns: {
            id: true,
            full_name: true,
            handle: true,
            avatar_url: true,
          },
        },
      },
    });

    return messages;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Status transitions (host only)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start a match: Full → InProgress. Only the host may transition.
   */
  async startMatch(userId: string, matchId: string) {
    await this.db.transaction(async (tx) => {
      const [match] = await tx
        .select({ id: matches.id, host_id: matches.host_id, status: matches.status })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }

      if (match.host_id !== userId) {
        throw new ForbiddenException('Only the match host can start the match.');
      }

      if (match.status !== 'Full') {
        throw new BadRequestException(
          `Cannot start a match with status "${match.status}". Match must be Full.`,
        );
      }

      await tx
        .update(matches)
        .set(withTimestamp({ status: 'InProgress' }))
        .where(eq(matches.id, matchId));
    });

    // Return fully populated match with relations (API Contract Rule §2)
    return this.findOne(matchId);
  }

  /**
   * Complete a match: InProgress → Completed. Only the host may transition.
   */
  async completeMatch(userId: string, matchId: string) {
    await this.db.transaction(async (tx) => {
      const [match] = await tx
        .select({ id: matches.id, host_id: matches.host_id, status: matches.status })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }

      if (match.host_id !== userId) {
        throw new ForbiddenException('Only the match host can complete the match.');
      }

      if (match.status !== 'InProgress') {
        throw new BadRequestException(
          `Cannot complete a match with status "${match.status}". Match must be InProgress.`,
        );
      }

      await tx
        .update(matches)
        .set(withTimestamp({ status: 'Completed', completed_at: new Date() }))
        .where(eq(matches.id, matchId));
    });

    // Return fully populated match with relations (API Contract Rule §2)
    return this.findOne(matchId);
  }

  /**
   * Cancel a match: Open | Full → Cancelled. Only the host may transition.
   */
  async cancelMatch(userId: string, matchId: string) {
    await this.db.transaction(async (tx) => {
      const [match] = await tx
        .select({ id: matches.id, host_id: matches.host_id, status: matches.status })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }

      if (match.host_id !== userId) {
        throw new ForbiddenException('Only the match host can cancel the match.');
      }

      if (match.status !== 'Open' && match.status !== 'Full') {
        throw new BadRequestException(
          `Cannot cancel a match with status "${match.status}". Match must be Open or Full.`,
        );
      }

      await tx
        .update(matches)
        .set(withTimestamp({ status: 'Cancelled' }))
        .where(eq(matches.id, matchId));
    });

    // Return fully populated match with relations (API Contract Rule §2)
    return this.findOne(matchId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Player of the Match — Voting & Results
  // ─────────────────────────────────────────────────────────────────────────

  /** Voting window: 24 hours after match completion */
  private static readonly VOTING_WINDOW_HOURS = 24;

  /**
   * Cast or update a Player of the Match vote.
   * Validates: match is completed, voting window is open, voter attended
   * (not no-show), and candidate is not the voter themselves.
   */
  async castVote(
    voterId: string,
    matchId: string,
    candidateId: string,
  ): Promise<{ matchId: string; votedFor: string; message: string }> {
    // Cannot vote for yourself
    if (voterId === candidateId) {
      throw new BadRequestException('You cannot vote for yourself.');
    }

    const [match] = await this.db
      .select({
        id: matches.id,
        status: matches.status,
        completed_at: matches.completed_at,
      })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    if (match.status !== 'Completed') {
      throw new BadRequestException(
        `Voting is only available for completed matches. Current status: "${match.status}".`,
      );
    }

    // Check voting window
    if (!match.completed_at) {
      throw new BadRequestException('Match completion time not recorded.');
    }
    const votingClosesAt = new Date(
      match.completed_at.getTime() +
        MatchesService.VOTING_WINDOW_HOURS * 60 * 60 * 1000,
    );
    if (new Date() > votingClosesAt) {
      throw new BadRequestException('The voting window has closed.');
    }

    // Verify voter attended the match (is in roster and not a no-show)
    const [voterPlayer] = await this.db
      .select({ id: match_players.id, no_show: match_players.no_show })
      .from(match_players)
      .where(
        sql`${match_players.match_id} = ${matchId} AND ${match_players.user_id} = ${voterId}`,
      )
      .limit(1);

    if (!voterPlayer) {
      throw new BadRequestException(
        'You did not attend this match, so you cannot vote.',
      );
    }

    if (voterPlayer.no_show) {
      throw new BadRequestException(
        'Players who did not show up cannot vote.',
      );
    }

    // Verify candidate also attended (is in roster, not no-show)
    const [candidatePlayer] = await this.db
      .select({ id: match_players.id })
      .from(match_players)
      .where(
        sql`${match_players.match_id} = ${matchId} AND ${match_players.user_id} = ${candidateId} AND ${match_players.no_show} = false`,
      )
      .limit(1);

    if (!candidatePlayer) {
      throw new BadRequestException(
        'The selected player did not attend this match.',
      );
    }

    // Upsert the vote (unique constraint on match_id + voter_id)
    await this.db
      .insert(match_votes)
      .values({
        match_id: matchId,
        voter_id: voterId,
        candidate_id: candidateId,
      })
      .onConflictDoUpdate({
        target: [match_votes.match_id, match_votes.voter_id],
        set: { candidate_id: candidateId, created_at: new Date() },
      });

    return {
      matchId,
      votedFor: candidateId,
      message: 'Vote recorded.',
    };
  }

  /**
   * Get Player of the Match status for a completed match.
   * - If voting is still open: returns candidates and whether user has voted
   * - If voting is closed: returns the winner (player with most votes) or
   *   no_winner status if tied or no votes were cast
   */
  async getPomResult(matchId: string, userId: string) {
    const [match] = await this.db
      .select({
        id: matches.id,
        status: matches.status,
        completed_at: matches.completed_at,
      })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    if (match.status !== 'Completed') {
      return { status: 'not_completed' as const };
    }

    if (!match.completed_at) {
      return { status: 'not_completed' as const };
    }

    const votingClosesAt = new Date(
      match.completed_at.getTime() +
        MatchesService.VOTING_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const now = new Date();

    // ── Voting still open ──
    if (now < votingClosesAt) {
      // Get eligible candidates (all attendees except the current user)
      const candidates = await this.db
        .select({
          id: users.id,
          fullName: users.full_name,
          avatarUrl: users.avatar_url,
        })
        .from(match_players)
        .innerJoin(users, eq(users.id, match_players.user_id))
        .where(
          sql`${match_players.match_id} = ${matchId}
              AND ${match_players.no_show} = false
              AND ${match_players.user_id} != ${userId}`,
        );

      // Check if user has already voted
      const [existingVote] = await this.db
        .select({ candidateId: match_votes.candidate_id })
        .from(match_votes)
        .where(
          sql`${match_votes.match_id} = ${matchId} AND ${match_votes.voter_id} = ${userId}`,
        )
        .limit(1);

      return {
        status: 'voting_open' as const,
        completedAt: match.completed_at,
        votingClosesAt,
        hasVoted: !!existingVote,
        votedFor: existingVote?.candidateId ?? null,
        candidates: candidates.map((c) => ({
          id: c.id,
          fullName: c.fullName ?? 'Player',
          avatarUrl: c.avatarUrl,
        })),
      };
    }

    // ── Voting closed — determine winner ──
    const voteCounts = await this.db.execute(sql`
      SELECT
        mv.candidate_id,
        u.full_name,
        u.avatar_url,
        COUNT(*)::int AS vote_count
      FROM ${match_votes} mv
      INNER JOIN ${users} u ON u.id = mv.candidate_id
      WHERE mv.match_id = ${matchId}
      GROUP BY mv.candidate_id, u.full_name, u.avatar_url
      ORDER BY vote_count DESC
      LIMIT 5
    `);

    const results = voteCounts as unknown as Array<{
      candidate_id: string;
      full_name: string | null;
      avatar_url: string | null;
      vote_count: number;
    }>;

    if (results.length === 0) {
      return { status: 'no_winner' as const };
    }

    // Check for tie at the top
    const topCount = results[0].vote_count;
    const tiedWinners = results.filter((r) => r.vote_count === topCount);

    if (tiedWinners.length > 1) {
      return { status: 'no_winner' as const };
    }

    const winner = results[0];
    return {
      status: 'completed' as const,
      winner: {
        id: winner.candidate_id,
        fullName: winner.full_name ?? 'Player',
        avatarUrl: winner.avatar_url,
      },
      voteCount: winner.vote_count,
    };
  }
}
