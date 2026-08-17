import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { eq, sql, and, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { disputes, matches, match_messages, match_players, match_votes, pitch_slots, transactions, users } from '../../database/schema';
import { GetMatchesDto } from './dto/get-matches.dto';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { withTimestamp } from '../../common/utils/timestamp';
import { WalletService } from '../wallet/wallet.service';
import { AppGateway } from '../gateway/app.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivitiesService } from '../activities/activities.service';

/** Margin added on top of the raw pitch cost per player (SAR). */
const PLATFORM_MARGIN_SAR = 5;

/** Round a SAR amount up to 2 decimal places (money-safe, never rounds down). */
const round2 = (n: number): number => Math.ceil(n * 100) / 100;

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
  pitch_size?: string;
  pitch_surface?: string;
  venue_name: string;
  venue_city: string;
  is_joined: boolean;
  has_voted: boolean;
  visibility: 'public' | 'private';
  /** Authoritative POTM voting deadline: effective completion + 24h. */
  voting_closes_at?: Date | null;
}

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly walletService: WalletService,
    private readonly appGateway: AppGateway,
    private readonly notificationsService: NotificationsService,
    private readonly activitiesService: ActivitiesService,
    private readonly settings: PlatformSettingsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Match Lifecycle — Auto-complete past matches
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the effective status of a match, auto-completing past matches
   * whose scheduled end time has passed without needing a DB write.
   *
   * Terminal states (Completed, Cancelled) are returned as-is.
   * Active states (Open, Full, InProgress) are promoted to Completed
   * when ``scheduled_at + duration_mins`` is in the past.
   */
  private static resolveEffectiveStatus(match: {
    status: string;
    scheduled_at: Date;
    duration_mins: number;
    completed_at: Date | null;
  }): string {
    if (['Completed', 'Cancelled'].includes(match.status)) {
      return match.status;
    }
    const endTime = new Date(
      match.scheduled_at.getTime() + match.duration_mins * 60 * 1000,
    );
    if (new Date() >= endTime) {
      return 'Completed';
    }
    return match.status;
  }

  /**
   * The timestamp POTM voting opens from. Persisted `completed_at` when set,
   * otherwise the scheduled end time — matches that end *between* restarts
   * still carry `completed_at = NULL` (auto-complete runs only at module
   * init), so we must fall back to the scheduled end for the voting window
   * to be correct. This keeps pre-restart (virtual) and post-restart
   * (auto-completed) behaviour identical.
   */
  private static effectiveCompletedAt(match: {
    scheduled_at: Date;
    duration_mins: number;
    completed_at: Date | null;
  }): Date {
    if (match.completed_at) return match.completed_at;
    return new Date(
      match.scheduled_at.getTime() + match.duration_mins * 60 * 1000,
    );
  }

  /**
   * Bulk-update past Open/Full/InProgress matches to Completed.
   * Runs once at module init so the DB state reflects reality.
   * Query-time ``resolveEffectiveStatus`` handles the window between
   * match end and the next restart.
   *
   * @returns number of rows updated.
   */
  async autoCompletePastMatches(): Promise<number> {
    const result = await this.db.execute(sql`
      UPDATE ${matches}
      SET status = 'Completed',
          completed_at = scheduled_at + (COALESCE(${matches.duration_mins}, 60) || ' minutes')::interval,
          updated_at = NOW()
      WHERE status IN ('Open', 'Full', 'InProgress')
        AND scheduled_at + (COALESCE(${matches.duration_mins}, 60) || ' minutes')::interval < NOW()
    `);
    const res = result as unknown as { count?: number; length?: number };
    return res.count ?? res.length ?? 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Discovery feed — PostGIS ST_DWithin geo-filter
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns matches ordered by proximity when coordinates are supplied
   * (nearest-first, soft geo — never a hard radius exclusion), otherwise
   * chronologically. Private matches are returned only to their own
   * host/participants.
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
    const { lat, lng, radius_km = 50, date, format, gender, max_price, venue_id } = dto;

    if ((lat === undefined) !== (lng === undefined)) {
      throw new BadRequestException('Both lat and lng must be provided together.');
    }

    const hasCoords = lat !== undefined && lng !== undefined;

    // ── Date window filter (Riyadh local day, matches the PWA's dateInRiyadh) ──
    const dateClause = date
      ? sql`AND (m.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = ${date}::date`
      : sql``;

    // ── Geo: SOFT — distance is computed for sorting/badging only. Discovery
    // never excludes matches by radius: a public match anywhere is visible to
    // everyone (product decision, US2). NULL location → NULL distance. ──
    const distanceExpr = hasCoords
      ? sql`ST_Distance(
            m.location,
            ST_SetSRID(ST_MakePoint(${lng ?? 0}, ${lat ?? 0}), 4326)::geography
          )`
      : sql`NULL`;

    // ── Format filter (5v5, 7v7, 8v8, 11v11) ──────────────────────────────
    const formatClause = format
      ? sql`AND p.size = ${format}`
      : sql``;

    // ── Gender filter ──────────────────────────────────────────────────────
    const genderClause = gender
      ? sql`AND m.gender_rule = ${gender}`
      : sql``;

    // ── Max price filter ──────────────────────────────────────────────────
    const priceClause = max_price != null
      ? sql`AND m.price_per_player::float <= ${max_price}`
      : sql``;

    // ── Venue filter (for club detail screen) ────────────────────────────
    const venueClause = venue_id
      ? sql`AND v.id = ${venue_id}::text`
      : sql``;

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
        COUNT(mp.id)::int                                     AS spots_filled,
        ${distanceExpr}           AS distance_m,
        u.id                      AS host_id,
        u.full_name               AS host_name,
        u.avatar_url              AS host_avatar,
        p.id                      AS pitch_id,
        p.name                    AS pitch_name,
        p.size                    AS pitch_size,
        p.surface_type            AS pitch_surface,
        v.name                    AS venue_name,
        v.city                    AS venue_city,
        COALESCE(BOOL_OR(mp.user_id = ${currentUserId}::text), FALSE) AS is_joined,
        EXISTS(SELECT 1 FROM match_votes mv WHERE mv.match_id = m.id AND mv.voter_id = ${currentUserId}::text) AS has_voted,
        m.visibility               AS visibility,
        COALESCE(
          m.completed_at,
          m.scheduled_at + (COALESCE(m.duration_mins, 60) * INTERVAL '1 minute')
        ) + INTERVAL '24 hours'    AS voting_closes_at
      FROM matches m
      INNER JOIN users   u  ON u.id  = m.host_id
      INNER JOIN pitches p  ON p.id  = m.pitch_id
      INNER JOIN venues  v  ON v.id  = p.venue_id
      LEFT  JOIN match_players mp ON mp.match_id = m.id
      WHERE (
        ${
          currentUserId
            ? sql`
                (
                  m.status IN ('Open', 'Full', 'InProgress')
                  AND (m.scheduled_at + (COALESCE(m.duration_mins, 60) * INTERVAL '1 minute')) >= NOW()
                )
                OR (
                  -- Matches the user played in stay visible while the POTM
                  -- voting window (24h after the effective completion) is
                  -- still open, even after midnight. Keep in sync with
                  -- VOTING_WINDOW_HOURS and effectiveCompletedAt().
                  COALESCE(m.completed_at, m.scheduled_at + (COALESCE(m.duration_mins, 60) * INTERVAL '1 minute')) >= NOW() - INTERVAL '24 hours'
                  AND (mp.user_id = ${currentUserId}::text OR m.host_id = ${currentUserId}::text)
                )
              `
            : sql`
                m.status IN ('Open', 'Full', 'InProgress')
                AND (m.scheduled_at + (COALESCE(m.duration_mins, 60) * INTERVAL '1 minute')) >= NOW()
              `
        }
      )
        -- Visibility: private matches are hidden from discovery feeds for
        -- everyone except their own host/participants (invite-link only).
        -- EXISTS subquery — aggregates are not allowed in WHERE.
        AND (
          m.visibility = 'public'
          OR m.host_id = ${currentUserId ?? null}::text
          OR EXISTS (
            SELECT 1 FROM match_players mpv
            WHERE mpv.match_id = m.id AND mpv.user_id = ${currentUserId ?? null}::text
          )
        )
        ${dateClause}
        ${formatClause}
        ${genderClause}
        ${priceClause}
        ${venueClause}
      GROUP BY m.id, u.id, p.id, v.id
      ORDER BY
        ${
          hasCoords
            ? sql`distance_m ASC NULLS LAST, m.scheduled_at ASC`
            : sql`m.scheduled_at ASC`
        }
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
   * The platform margin is read from `app_settings` (`platform_margin_sar`)
   * so admins can tune pricing from the Settings screen without a redeploy.
   *
   * @param pitchCostSar  Total hourly pitch rental cost in SAR.
   * @param players       Expected number of players (must be ≥ 2).
   */
  async calculatePricePerPlayer(pitchCostSar: number, players: number): Promise<number> {
    if (players < 2) {
      throw new BadRequestException('A match requires at least 2 players.');
    }
    const margin = await this.settings.getNumber('platform_margin_sar', PLATFORM_MARGIN_SAR);
    const raw = pitchCostSar / (players - 1) + margin;
    return round2(raw); // round up to 2 d.p.
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
              },
            },
          },
        },
        messages: {
          with: {
            user: {
              columns: {
                id: true,
                full_name: true,
                avatar_url: true,
              },
            },
          },
          orderBy: (msg, { asc }) => [asc(msg.created_at)],
        },
      },
    });

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    // Apply virtual status — past matches show as Completed
    match.status = MatchesService.resolveEffectiveStatus({
      status: match.status,
      scheduled_at: match.scheduled_at,
      duration_mins: match.duration_mins ?? 60,
      completed_at: match.completed_at,
    }) as typeof match.status;

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

      // Allow joining if Open, Full, or InProgress with spots available
      if (match.status !== 'Open' && match.status !== 'Full' && match.status !== 'InProgress') {
        throw new BadRequestException('This match is no longer open for joining.');
      }
      if (match.status === 'Full') {
        // Stale Full status — revert to Open before allowing join
        await tx
          .update(matches)
          .set(withTimestamp({ status: 'Open' }))
          .where(eq(matches.id, matchId));
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
    const updatedMatch = await this.findOne(matchId);
    try {
      this.appGateway.broadcastRosterUpdate(matchId, updatedMatch);
      this.appGateway.broadcastStatusUpdate(matchId, updatedMatch);
    } catch (err) {
      this.logger.error(`WS broadcast error on joinMatch: ${(err as Error).message}`);
    }

    // Fan out "joined_match" to the host + other participants (fire-and-forget).
    const participants = await this.db
      .select({ user_id: match_players.user_id })
      .from(match_players)
      .where(eq(match_players.match_id, matchId));
    await this.activitiesService
      .record({
        actorId: userId,
        verb: 'joined_match',
        matchId,
        recipients: participants.map((p) => p.user_id),
      })
      .catch(() => undefined);

    return updatedMatch;
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
    const updatedMatch = await this.findOne(matchId);
    try {
      this.appGateway.broadcastRosterUpdate(matchId, updatedMatch);
      this.appGateway.broadcastStatusUpdate(matchId, updatedMatch);
    } catch (err) {
      this.logger.error(`WS broadcast error on leaveMatch: ${(err as Error).message}`);
    }
    return updatedMatch;
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
      pitchCostSar?: number;
      booking_mode?: 'koralink' | 'self';
      booking_slot_id?: string;
      visibility?: 'public' | 'private';
    },
  ) {
    // Validate pitch exists and fetch venue location + hourly rate.
    // The pitch cost is DERIVED server-side from hourly_rate × duration — the
    // client-supplied `pitchCostSar` is ignored (single source of truth).
    const [pitch] = await this.db
      .select({
        id: schema.pitches.id,
        venueLocation: schema.venues.location,
        hourlyRate: schema.pitches.hourly_rate,
      })
      .from(schema.pitches)
      .innerJoin(schema.venues, eq(schema.pitches.venue_id, schema.venues.id))
      .where(eq(schema.pitches.id, dto.pitch_id))
      .limit(1);

    if (!pitch) {
      throw new NotFoundException(`Pitch ${dto.pitch_id} not found.`);
    }

    const bookingMode = dto.booking_mode ?? 'self';
    const visibility = dto.visibility ?? 'public';
    const pitchCostSar = round2(
      parseFloat(pitch.hourlyRate) * dto.duration_mins / 60,
    );
    const pricePerPlayer = await this.calculatePricePerPlayer(
      pitchCostSar,
      dto.max_players,
    );

    const created = await this.db.transaction(async (tx) => {
      // ── Atomic slot booking (koralink mode) ────────────────────
      if (bookingMode === 'koralink') {
        if (!dto.booking_slot_id) {
          throw new BadRequestException('booking_slot_id is required for koralink mode');
        }

        const [slot] = await tx.execute(sql`
          SELECT id, is_booked FROM pitch_slots
          WHERE id = ${dto.booking_slot_id}::text
          FOR UPDATE
        `) as unknown as [{ id: string; is_booked: boolean }];

        if (!slot) {
          throw new NotFoundException(`Slot ${dto.booking_slot_id} not found`);
        }

        if (slot.is_booked) {
          throw new ConflictException('This slot has already been booked by another host');
        }
      }

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
          pitch_cost_sar: pitchCostSar.toString(),
          max_players: dto.max_players,
          status: 'Open',
          visibility,
          booking_mode: bookingMode,
          booking_slot_id: bookingMode === 'koralink' ? dto.booking_slot_id : null,
          // Inherit venue location so geo-discovery works for user-created matches
          ...(pitch.venueLocation ? { location: pitch.venueLocation } : {}),
        })
        .returning();

      // 2. Mark slot as booked (koralink mode)
      if (bookingMode === 'koralink' && dto.booking_slot_id) {
        await tx
          .update(pitch_slots)
          .set(withTimestamp({ is_booked: true, booked_match_id: match.id }))
          .where(eq(pitch_slots.id, dto.booking_slot_id));

        // 2b. Deduct pitch cost from host wallet (koralink mode)
        if (pitchCostSar > 0) {
          // Check balance first
          const [user] = await tx
            .select({ wallet_balance: users.wallet_balance })
            .from(users)
            .where(eq(users.id, hostId))
            .limit(1);

          if (!user || parseFloat(user.wallet_balance) < pitchCostSar) {
            throw new BadRequestException(
              `Insufficient wallet balance. Required: SAR ${pitchCostSar.toFixed(2)}, Available: SAR ${parseFloat(user?.wallet_balance ?? '0').toFixed(2)}`,
            );
          }

          // Deduct from wallet atomically
          await tx
            .update(users)
            .set({
              wallet_balance: sql`${users.wallet_balance} - ${pitchCostSar.toString()}`,
              updated_at: new Date(),
            })
            .where(eq(users.id, hostId));

          // Record ledger entry
          await tx.insert(schema.transactions).values({
            user_id: hostId,
            type: 'DEBIT',
            amount: pitchCostSar.toString(),
            reference_type: 'PITCH_BOOKING',
            reference_id: dto.booking_slot_id,
            idempotency_key: `slot-booking-${dto.booking_slot_id}`,
            status: 'Completed',
          });
        }
      }

      // 3. Add host to match_players
      await tx.insert(schema.match_players).values({
        match_id: match.id,
        user_id: hostId,
        is_host: true,
        team: 'Home',
      });

      return match;
    });

    // Fetch complete match with host relation so the frontend gets full_name etc.
    const fullMatch = await this.findOne(created.id);

    this.logger.log(
      `match_created matchId=${created.id} bookingMode=${bookingMode} pitchCostSar=${pitchCostSar} pricePerPlayer=${pricePerPlayer} maxPlayers=${dto.max_players}`,
      MatchesService.name,
    );

    // Fan out "created_match" to the host's followers (fire-and-forget).
    // Private matches NEVER fan out — they must stay invisible to
    // non-participants in every feed (product rule US3).
    if ((dto.visibility ?? 'public') === 'public') {
      const followers = await this.db
        .select({ follower_id: schema.follows.follower_id })
        .from(schema.follows)
        .where(eq(schema.follows.following_id, hostId));
      await this.activitiesService
        .record({
          actorId: hostId,
          verb: 'created_match',
          matchId: created.id,
          recipients: followers.map((f) => f.follower_id),
        })
        .catch(() => undefined);
    }

    return fullMatch;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pitch slots — availability lookup
  // ─────────────────────────────────────────────────────────────────────────

  async getPitchSlots(pitchId: string, date: string) {
    const rows = await this.db
      .select({
        id: pitch_slots.id,
        pitch_id: pitch_slots.pitch_id,
        slot_date: pitch_slots.slot_date,
        start_time: pitch_slots.start_time,
        end_time: pitch_slots.end_time,
        is_booked: pitch_slots.is_booked,
        booked_match_id: pitch_slots.booked_match_id,
        created_at: pitch_slots.created_at,
        updated_at: pitch_slots.updated_at,
      })
      .from(pitch_slots)
      .where(
        sql`${pitch_slots.pitch_id} = ${pitchId}::text AND ${pitch_slots.slot_date} = ${date}::date`,
      )
      .orderBy(pitch_slots.start_time);

    return rows;
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

  /**
   * Persist a match chat message with membership + idempotency checks.
   * REST fallback to the WebSocket `send-message` path.
   */
  async sendMessage(
    userId: string,
    matchId: string,
    content: string,
    clientMessageId?: string,
  ) {
    const trimmed = content?.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty.');
    }

    // Only match members may post to the lobby.
    const [membership] = await this.db
      .select({ id: match_players.id })
      .from(match_players)
      .where(
        and(
          eq(match_players.match_id, matchId),
          eq(match_players.user_id, userId),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new ForbiddenException('You are not a member of this match.');
    }

    const clientMessageIdValue = clientMessageId?.trim() || null;

    // Idempotency — retried sends return the existing message, no duplicate.
    if (clientMessageIdValue) {
      const existing = await this.db.query.match_messages.findFirst({
        where: and(
          eq(match_messages.user_id, userId),
          eq(match_messages.match_id, matchId),
          eq(match_messages.client_message_id, clientMessageIdValue),
        ),
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
      if (existing) return existing;
    }

    const [inserted] = await this.db
      .insert(match_messages)
      .values({
        match_id: matchId,
        user_id: userId,
        content: trimmed,
        client_message_id: clientMessageIdValue,
      })
      .returning();

    const [user] = await this.db
      .select({
        id: users.id,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return { ...inserted, user };
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
    const updatedMatch = await this.findOne(matchId);
    try {
      this.appGateway.broadcastStatusUpdate(matchId, updatedMatch);
    } catch (err) {
      this.logger.error(`WS broadcast error on startMatch: ${(err as Error).message}`);
    }
    return updatedMatch;
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
    const updatedMatch = await this.findOne(matchId);
    try {
      this.appGateway.broadcastStatusUpdate(matchId, updatedMatch);
    } catch (err) {
      this.logger.error(`WS broadcast error on completeMatch: ${(err as Error).message}`);
    }
    return updatedMatch;
  }

  /**
   * Cancel a match: Open | Full → Cancelled. Only the host may transition.
   * In koralink mode, releases the booked slot and refunds the pitch cost.
   */
  async cancelMatch(userId: string, matchId: string) {
    let refundedSar = 0;
    await this.db.transaction(async (tx) => {
      const [match] = await tx
        .select({
          id: matches.id,
          host_id: matches.host_id,
          status: matches.status,
          booking_mode: matches.booking_mode,
          booking_slot_id: matches.booking_slot_id,
          pitch_cost_sar: matches.pitch_cost_sar,
          price_per_player: matches.price_per_player,
          max_players: matches.max_players,
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }

      if (match.host_id !== userId) {
        throw new ForbiddenException('Only the match host can cancel the match.');
      }

      // Emergency cancel: a host may cancel an InProgress match (the PWA shows
      // the EmergencyCancelSheet and opens a support ticket for refunds).
      if (
        match.status !== 'Open' &&
        match.status !== 'Full' &&
        match.status !== 'InProgress'
      ) {
        throw new BadRequestException(
          `Cannot cancel a match with status "${match.status}". Match must be Open, Full, or InProgress.`,
        );
      }

      await tx
        .update(matches)
        .set(withTimestamp({ status: 'Cancelled' }))
        .where(eq(matches.id, matchId));

      // Release slot + refund (koralink mode)
      if (match.booking_mode === 'koralink' && match.booking_slot_id) {
        const [slot] = await tx
          .select({ id: pitch_slots.id, is_booked: pitch_slots.is_booked })
          .from(pitch_slots)
          .where(eq(pitch_slots.id, match.booking_slot_id))
          .limit(1);

        if (slot && slot.is_booked) {
          await tx
            .update(pitch_slots)
            .set(withTimestamp({ is_booked: false, booked_match_id: null }))
            .where(eq(pitch_slots.id, match.booking_slot_id));

          // Refund the exact pitch cost the host was debited at create.
          // Never derive this from price_per_player — that embeds the
          // platform margin and would over-refund the host.
          const refundSar = match.pitch_cost_sar
            ? parseFloat(match.pitch_cost_sar)
            : 0;
          refundedSar = refundSar;
          if (refundSar > 0) {
            await tx
              .update(users)
              .set({
                wallet_balance: sql`${users.wallet_balance} + ${refundSar.toString()}`,
                updated_at: new Date(),
              })
              .where(eq(users.id, userId));

            await tx.insert(transactions).values({
              user_id: userId,
              type: 'CREDIT',
              amount: refundSar.toString(),
              reference_type: 'REFUND',
              reference_id: matchId,
              idempotency_key: `refund-${matchId}`,
              status: 'Completed',
            });
          }
        }
      }
    });

    // Return fully populated match with relations (API Contract Rule §2)
    const updatedMatch = await this.findOne(matchId);
    try {
      this.appGateway.broadcastStatusUpdate(matchId, updatedMatch);
    } catch (err) {
      this.logger.error(`WS broadcast error on cancelMatch: ${(err as Error).message}`);
    }
    this.logger.log(`match_cancelled matchId=${matchId} refundSar=${refundedSar}`, MatchesService.name);
    return updatedMatch;
  }

  /**
   * Mark a player as no-show (or unmark). Host only.
   */
  async markNoShow(hostId: string, matchId: string, targetUserId: string, noShow: boolean) {
    const graceMins = await this.settings.getNumber('grace_period_mins', 0);
    await this.db.transaction(async (tx) => {
      const [match] = await tx
        .select({
          id: matches.id,
          host_id: matches.host_id,
          status: matches.status,
          scheduled_at: matches.scheduled_at,
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }

      if (match.host_id !== hostId) {
        throw new ForbiddenException('Only the match host can mark no-shows.');
      }

      // Attendance is only meaningful once a match is underway or finished.
      if (match.status !== 'InProgress' && match.status !== 'Completed') {
        throw new BadRequestException(
          `Attendance can only be marked for an in-progress or completed match (current: "${match.status}").`,
        );
      }

      // Respect the no-show grace window from Settings — hosts can't mark a
      // player no-show before the scheduled start plus the grace period.
      if (graceMins > 0) {
        const deadline = new Date(match.scheduled_at.getTime() + graceMins * 60_000);
        if (Date.now() < deadline.getTime()) {
          throw new BadRequestException(
            `Attendance can only be marked ${graceMins} minutes after the scheduled start time.`,
          );
        }
      }

      const [player] = await tx
        .select({ id: schema.match_players.id, no_show: schema.match_players.no_show })
        .from(schema.match_players)
        .where(
          and(
            eq(schema.match_players.match_id, matchId),
            eq(schema.match_players.user_id, targetUserId),
          ),
        )
        .limit(1);

      if (!player) {
        throw new NotFoundException('Player is not in the match roster.');
      }

      await tx
        .update(schema.match_players)
        .set({ no_show: noShow })
        .where(eq(schema.match_players.id, player.id));

      // Keep the user's running no-show count in sync (admin dashboard +
      // reputation). Only adjust when the flag actually flips so repeated
      // host actions stay idempotent.
      if (player.no_show !== noShow) {
        await tx
          .update(schema.users)
          .set(
            withTimestamp({
              no_show_count: noShow
                ? sql`${schema.users.no_show_count} + 1`
                : sql`GREATEST(${schema.users.no_show_count} - 1, 0)`,
            }),
          )
          .where(eq(schema.users.id, targetUserId));
      }
    });

    const updatedMatch = await this.findOne(matchId);
    try {
      this.appGateway.broadcastRosterUpdate(matchId, updatedMatch);
    } catch (err) {
      this.logger.error(`WS broadcast error on markNoShow: ${(err as Error).message}`);
    }
    return updatedMatch;
  }

  /**
   * Opens a dispute on a match (most commonly a player appealing a no-show
   * mark). Only match participants can open one, and a `no_show` appeal
   * requires the player to actually have been marked no-show.
   */
  async createDispute(userId: string, matchId: string, dto: CreateDisputeDto) {
    const type = dto.type ?? 'no_show';

    const [match] = await this.db
      .select({ id: matches.id, host_id: matches.host_id })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    const [player] = await this.db
      .select({ id: match_players.id, no_show: match_players.no_show })
      .from(match_players)
      .where(and(eq(match_players.match_id, matchId), eq(match_players.user_id, userId)))
      .limit(1);

    if (!player) {
      throw new ForbiddenException('Only match participants can open a dispute.');
    }

    if (type === 'no_show' && !player.no_show) {
      throw new BadRequestException('You have not been marked no-show for this match.');
    }

    const [existing] = await this.db
      .select({ id: disputes.id })
      .from(disputes)
      .where(
        and(
          eq(disputes.match_id, matchId),
          eq(disputes.reporter_id, userId),
          eq(disputes.type, type),
          inArray(disputes.status, ['opened', 'under_review']),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException('You already have an open dispute for this match.');
    }

    const [created] = await this.db
      .insert(disputes)
      .values({
        match_id: matchId,
        reporter_id: userId,
        respondent_id: match.host_id,
        type,
        status: 'opened',
        evidence: dto.reason ? [{ reason: dto.reason, at: new Date().toISOString() }] : [],
      })
      .returning();

    return created;
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
        scheduled_at: matches.scheduled_at,
        duration_mins: matches.duration_mins,
        completed_at: matches.completed_at,
      })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    if (MatchesService.resolveEffectiveStatus(match) !== 'Completed') {
      throw new BadRequestException(
        `Voting is only available for completed matches. Current status: "${match.status}".`,
      );
    }

    // Check voting window (based on effective completion time — handles a
    // past-due match whose completed_at has not yet been persisted).
    const votingClosesAt = new Date(
      MatchesService.effectiveCompletedAt(match).getTime() +
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
        scheduled_at: matches.scheduled_at,
        duration_mins: matches.duration_mins,
        completed_at: matches.completed_at,
        pom_winner_id: matches.pom_winner_id,
        pom_announced_at: matches.pom_announced_at,
      })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    if (MatchesService.resolveEffectiveStatus(match) !== 'Completed') {
      return { status: 'not_completed' as const };
    }

    const votingClosesAt = new Date(
      MatchesService.effectiveCompletedAt(match).getTime() +
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
          team: match_players.team,
          isHost: match_players.is_host,
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

      // Total eligible voters (all attendees who showed up, incl. self)
      const [{ totalEligibleVoters }] = await this.db
        .select({ totalEligibleVoters: sql<number>`COUNT(*)::int` })
        .from(match_players)
        .where(
          sql`${match_players.match_id} = ${matchId} AND ${match_players.no_show} = false`,
        );

      // How many distinct voters have cast a vote so far
      const [{ votedCount }] = await this.db
        .select({ votedCount: sql<number>`COUNT(DISTINCT ${match_votes.voter_id})::int` })
        .from(match_votes)
        .where(sql`${match_votes.match_id} = ${matchId}`);

      return {
        status: 'voting_open' as const,
        completedAt: MatchesService.effectiveCompletedAt(match),
        votingClosesAt,
        hasVoted: !!existingVote,
        votedFor: existingVote?.candidateId ?? null,
        totalEligibleVoters: totalEligibleVoters ?? 0,
        votedCount: votedCount ?? 0,
        candidates: candidates.map((c) => ({
          id: c.id,
          fullName: c.fullName ?? 'Player',
          avatarUrl: c.avatarUrl,
          team: c.team,
          isHost: c.isHost,
        })),
      };
    }

    // ── Voting closed — determine winner ──
    // POTM invariant: a winner MUST be a member of the match roster and not a
    // no-show. Join match_players so votes cast for a player who left (or was
    // never in the lineup) are excluded from the tally.
    const voteCounts = await this.db.execute(sql`
      SELECT
        mv.candidate_id,
        u.full_name,
        u.avatar_url,
        COUNT(*)::int AS vote_count
      FROM ${match_votes} mv
      INNER JOIN ${users} u ON u.id = mv.candidate_id
      INNER JOIN ${match_players} mp
        ON mp.match_id = mv.match_id
       AND mp.user_id = mv.candidate_id
       AND mp.no_show = false
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
      return { status: 'no_votes' as const };
    }

    // Check for tie at the top
    const topCount = results[0].vote_count;
    const tiedWinners = results.filter((r) => r.vote_count === topCount);

    if (tiedWinners.length > 1) {
      return { status: 'no_winner' as const };
    }

    const winner = results[0];

    // ── Announce winner exactly once (persist + WS broadcast + push) ──
    await this.announcePomWinner(matchId, match.pom_winner_id, match.pom_announced_at, {
      id: winner.candidate_id,
      fullName: winner.full_name ?? 'Player',
      avatarUrl: winner.avatar_url,
      voteCount: winner.vote_count,
    });

    return {
      status: 'completed' as const,
      winner: {
        id: winner.candidate_id,
        fullName: winner.full_name ?? 'Player',
        avatarUrl: winner.avatar_url,
      },
      voteCount: winner.vote_count,
      results: results.map((r) => ({
        id: r.candidate_id,
        fullName: r.full_name ?? 'Player',
        avatarUrl: r.avatar_url,
        voteCount: r.vote_count,
      })),
    };
  }

  /**
   * Persist the POTM winner and notify attendees exactly once.
   * Idempotent via pom_announced_at — subsequent calls no-op.
   */
  private async announcePomWinner(
    matchId: string,
    existingWinnerId: string | null,
    announcedAt: Date | null,
    winner: { id: string; fullName: string; avatarUrl: string | null; voteCount: number },
  ): Promise<void> {
    if (announcedAt && existingWinnerId === winner.id) {
      return; // already announced for this winner
    }

    // Persist winner + announcement timestamp (idempotent gate).
    await this.db
      .update(matches)
      .set(
        withTimestamp({
          pom_winner_id: winner.id,
          pom_announced_at: new Date(),
        }),
      )
      .where(eq(matches.id, matchId));

    const payload = {
      matchId,
      winner: { id: winner.id, fullName: winner.fullName, avatarUrl: winner.avatarUrl },
      voteCount: winner.voteCount,
    };

    // Real-time broadcast to open clients.
    try {
      this.appGateway.broadcastPomDecided(matchId, payload);
    } catch (err) {
      this.logger.error(`WS broadcast failed for POTM ${matchId}: ${(err as Error).message}`);
    }

    // Web-push to attendees (fire-and-forget, config-gated).
    this.notificationsService
      .sendPomDecidedNotification(matchId, payload)
      .catch(() => undefined);

    // Fan out "pom_decided" to match participants (including the winner).
    const participants = await this.db
      .select({ user_id: match_players.user_id })
      .from(match_players)
      .where(eq(match_players.match_id, matchId));
    await this.activitiesService
      .record({
        actorId: winner.id,
        verb: 'pom_decided',
        matchId,
        subjectId: winner.id,
        recipients: participants.map((p) => p.user_id),
        excludeActor: false,
      })
      .catch(() => undefined);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // (Player reviews removed — POTM is the sole post-match recognition.)
  // ─────────────────────────────────────────────────────────────────────────
}
