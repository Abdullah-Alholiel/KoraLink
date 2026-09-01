import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq, sql, and, inArray, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { disputes, matches, match_messages, match_players, match_votes, pitch_slots, pitches, transactions, users } from '../../database/schema';
import {
  GetMatchesDto,
  normalizeGenderRule,
  TIME_WINDOWS,
} from './dto/get-matches.dto';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { withTimestamp } from '../../common/utils/timestamp';
import { WalletService } from '../wallet/wallet.service';
import { AppGateway } from '../gateway/app.gateway';
import { RealtimeService } from '../gateway/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivitiesService } from '../activities/activities.service';
import { UpdateMatchScheduleDto } from './dto/update-match-schedule.dto';

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
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Underfill protection: minimum total players (host included) for a match
   * format. Product rule — always even, two fewer than the format capacity:
   * 5v5 (10) → 8, 7v7 (14) → 12, 11v11 (22) → 20. Floored at 2 so tiny
   * formats still have a meaningful minimum.
   */
  static minPlayersFor(maxPlayers: number): number {
    const even = Math.floor((maxPlayers - 2) / 2) * 2;
    return Math.max(2, even);
  }

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

  /**
   * P1-1 scheduler: finalize POTM voting for every Completed match whose
   * 24h voting window has closed and whose winner was never announced.
   *
   * Idempotent: guarded by `pom_winner_id IS NULL AND pom_announced_at IS NULL`,
   * and `announcePomWinner` itself no-ops once announced. Tie → earliest vote
   * wins (POTM invariant: winner must be a roster member, not a no-show).
   *
   * @returns number of matches finalized this tick.
   */
  async finalizePomVoting(): Promise<number> {
    const due = await this.db
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
      .where(
        and(
          isNull(matches.pom_winner_id),
          isNull(matches.pom_announced_at),
          sql`${matches.scheduled_at} + (COALESCE(${matches.duration_mins}, 60) * INTERVAL '1 minute') + (${MatchesService.VOTING_WINDOW_HOURS} * INTERVAL '1 hour') < NOW()`,
        ),
      )
      .limit(50);

    let finalized = 0;
    for (const match of due) {
      try {
        const winner = await this.tallyPomVotes(match.id);
        if (winner.length > 0) {
          const topCount = winner[0].vote_count;
          const tied = winner.filter((r) => r.vote_count === topCount);
          if (tied.length === 1) {
            await this.announcePomWinner(match.id, null, null, {
              id: winner[0].candidate_id,
              fullName: winner[0].full_name ?? 'Player',
              avatarUrl: winner[0].avatar_url,
              voteCount: winner[0].vote_count,
            });
            finalized += 1;
            continue;
          }
        }
        // No votes, or a tie at the top: voting is closed with nothing to
        // announce. Stamp pom_announced_at so this match drops out of the
        // per-tick scan (votes cannot change after the window closes).
        await this.db
          .update(matches)
          .set(withTimestamp({ pom_announced_at: new Date() }))
          .where(eq(matches.id, match.id));
      } catch (err) {
        this.logger.error(
          `POTM finalize failed for match ${match.id}: ${(err as Error).message}`,
        );
      }
    }
    if (finalized > 0) {
      this.logger.log(`POTM scheduler: finalized ${finalized} match(es).`);
    }
    return finalized;
  }

  /**
   * P1-1 scheduler: push a "match starting soon" reminder to confirmed players
   * of matches starting within [15m, 45m). Each match is reminded exactly once
   * (reminders_sent_at guard).
   *
   * @returns number of matches reminded this tick.
   */
  async sendMatchStartReminders(): Promise<number> {
    const soon = await this.db
      .select({
        id: matches.id,
        title: matches.title,
        scheduled_at: matches.scheduled_at,
      })
      .from(matches)
      .where(
        and(
          isNull(matches.reminders_sent_at),
          inArray(matches.status, ['Open', 'Full']),
          sql`${matches.scheduled_at} > NOW() + INTERVAL '15 minutes'`,
          sql`${matches.scheduled_at} <= NOW() + INTERVAL '45 minutes'`,
        ),
      )
      .limit(50);

    let reminded = 0;
    for (const match of soon) {
      try {
        const players = await this.db
          .select({ user_id: match_players.user_id })
          .from(match_players)
          .where(
            and(
              eq(match_players.match_id, match.id),
              eq(match_players.no_show, false),
            ),
          );

        if (players.length > 0) {
          const kickoff = new Date(match.scheduled_at);
          await this.notificationsService.sendPushToUsers(
            players.map((p) => p.user_id),
            {
              key: 'match_starting_soon', // P2-8: text localized per subscriber
              vars: { title: match.title, kickoffISO: kickoff.toISOString() },
              data: { type: 'match-chat', matchId: match.id },
            },
          );
        }

        await this.db
          .update(matches)
          .set(
            withTimestamp({
              reminders_sent_at: new Date(),
            }),
          )
          .where(eq(matches.id, match.id));
        reminded += 1;
      } catch (err) {
        this.logger.error(
          `Reminder failed for match ${match.id}: ${(err as Error).message}`,
        );
      }
    }
    if (reminded > 0) {
      this.logger.log(`Reminder scheduler: reminded ${reminded} match(es).`);
    }
    return reminded;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Underfill protection — match-day nudges + auto-cancel below minimum
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Scheduler-driven underfill protection. Two passes per tick:
   *
   * 1. HOST NUDGE — on match day (Asia/Riyadh), while the roster total is
   *    below `min_players`, remind the host to invite players (bell + push),
   *    at most once per hour (`last_nudge_at`). Reaching minimum clears the
   *    timestamp, so a later drop (withdrawal) nudges again immediately from
   *    `leaveMatch` and hourly nudging resumes.
   * 2. AUTO-CANCEL — a match still below minimum when kick-off is within the
   *    next hour is cancelled automatically (status → Cancelled, koralink slot
   *    released, host refunded exactly `pitch_cost_sar`) and every roster
   *    player is notified. Guarded UPDATE makes it single-shot even if ticks
   *    overlap.
   *
   * Legacy rows (`min_players = 0`) are exempt from both passes.
   */
  async checkMinPlayers(): Promise<{ nudged: number; cancelled: number }> {
    let nudged = 0;
    let cancelled = 0;

    // ── Pass 0: re-arm nudges for matches that reached minimum. ──
    await this.db.execute(sql`
      UPDATE ${matches}
      SET last_nudge_at = NULL, updated_at = NOW()
      WHERE min_players > 0
        AND last_nudge_at IS NOT NULL
        AND status IN ('Open', 'Full')
        AND (
          SELECT COUNT(*)::int FROM ${match_players} mp
          WHERE mp.match_id = ${matches.id}
        ) >= ${matches.min_players}
    `);

    // ── Pass 1: hourly host nudges on match day (below minimum). ──
    const due = await this.db.execute(sql`
      SELECT m.id, m.title, m.host_id, m.min_players,
             m.scheduled_at, m.last_nudge_at,
             (SELECT COUNT(*)::int FROM match_players mp WHERE mp.match_id = m.id)
               AS total_players
      FROM matches m
      WHERE m.status IN ('Open', 'Full')
        AND m.min_players > 0
        AND (m.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date
              = (NOW() AT TIME ZONE 'Asia/Riyadh')::date
        AND m.scheduled_at > NOW() + INTERVAL '61 minutes'
        AND (m.last_nudge_at IS NULL
             OR m.last_nudge_at < NOW() - INTERVAL '1 hour')
        AND (SELECT COUNT(*)::int FROM match_players mp WHERE mp.match_id = m.id)
              < m.min_players
      ORDER BY m.scheduled_at ASC
      LIMIT 50
    `);

    for (const row of (due as unknown as Array<{
      id: string; title: string; host_id: string; min_players: number;
      total_players: number;
    }>)) {
      try {
        const needed = row.min_players - row.total_players;
        await this.activitiesService.record({
          actorId: row.host_id,
          verb: 'host_underfilled_nudge',
          matchId: row.id,
          recipients: [row.host_id],
          excludeActor: false,
        });
        await this.notificationsService.sendPushToUsers([row.host_id], {
          key: 'players_needed', // P2-8: text localized per subscriber
          vars: { title: row.title, needed },
          data: { type: 'match-chat', matchId: row.id },
        });
        await this.db.execute(sql`
          UPDATE ${matches} SET last_nudge_at = NOW(), updated_at = NOW()
          WHERE id = ${row.id}::text
        `);
        nudged += 1;
      } catch (err) {
        this.logger.error(
          `Underfill nudge failed for match ${row.id}: ${(err as Error).message}`,
        );
      }
    }

    // ── Pass 2: auto-cancel matches below minimum within the hour. ──
    const expiring = await this.db.execute(sql`
      SELECT m.id, m.title, m.host_id, m.booking_mode, m.booking_slot_id,
             m.pitch_cost_sar, m.min_players,
             (SELECT COUNT(*)::int FROM match_players mp WHERE mp.match_id = m.id)
               AS total_players
      FROM matches m
      WHERE m.status IN ('Open', 'Full')
        AND m.min_players > 0
        AND m.scheduled_at > NOW()
        AND m.scheduled_at <= NOW() + INTERVAL '60 minutes'
        AND (SELECT COUNT(*)::int FROM match_players mp WHERE mp.match_id = m.id)
              < m.min_players
      ORDER BY m.scheduled_at ASC
      LIMIT 50
    `);

    for (const row of (expiring as unknown as Array<{
      id: string; title: string; host_id: string; booking_mode: string;
      booking_slot_id: string | null; pitch_cost_sar: string | null;
      min_players: number; total_players: number;
    }>)) {
      try {
        // Atomic single-shot transition (P0-4): status flip + refund + ledger +
        // slot release commit together or not at all. Before run #13 the guard
        // UPDATE committed FIRST and the money/slot side-effects ran as separate
        // auto-committed statements — a failure in between left a cancelled
        // match with a permanently booked slot and a host who was never
        // refunded (silent money loss in an automated path, no retry possible
        // once status left Open/Full). Mirrors manual cancelMatch (in-tx
        // release + refund from pitch_cost_sar, `refund-<id>` idempotency key).
        let guardWon = false;
        let releasedSlot = false;
        let refundedSar = 0;
        await this.db.transaction(async (tx) => {
          const guard = await tx.execute(sql`
            UPDATE ${matches} SET status = 'Cancelled', updated_at = NOW()
            WHERE id = ${row.id}::text AND status IN ('Open', 'Full')
          `);
          if ((guard as unknown as { rowCount?: number }).rowCount === 0) return;
          guardWon = true;

          // Release a koralink slot + refund the host exactly what he was
          // debited (same semantics as manual cancelMatch).
          if (row.booking_mode === 'koralink' && row.booking_slot_id) {
            const refundSar = row.pitch_cost_sar ? parseFloat(row.pitch_cost_sar) : 0;
            if (refundSar > 0) {
              await tx
                .update(users)
                .set({
                  wallet_balance: sql`${users.wallet_balance} + ${refundSar.toString()}`,
                  updated_at: new Date(),
                })
                .where(eq(users.id, row.host_id));

              await tx.insert(transactions).values({
                user_id: row.host_id,
                type: 'CREDIT',
                amount: refundSar.toString(),
                reference_type: 'REFUND',
                reference_id: row.id,
                idempotency_key: `refund-${row.id}`,
                status: 'Completed',
              });
              refundedSar = refundSar;
            }
            await tx
              .update(pitch_slots)
              .set(withTimestamp({ is_booked: false, booked_match_id: null }))
              .where(eq(pitch_slots.id, row.booking_slot_id));
            releasedSlot = true;
          }
        });
        if (!guardWon) {
          // Guard lost the race — the match was cancelled concurrently.
          continue;
        }

        // Notify every roster player (host included) — bell + push.
        const players = await this.db
          .select({ user_id: match_players.user_id })
          .from(match_players)
          .where(eq(match_players.match_id, row.id));
        const rosterIds = players.map((p) => p.user_id);
        if (rosterIds.length > 0) {
          await this.activitiesService.record({
            actorId: row.host_id,
            verb: 'match_auto_cancelled',
            matchId: row.id,
            recipients: rosterIds,
            excludeActor: false,
          });
          await this.notificationsService.sendPushToUsers(rosterIds, {
            key: 'match_cancelled', // P2-8: text localized per subscriber
            vars: { title: row.title },
            data: { type: 'match-cancelled', matchId: row.id },
          });
        }
        cancelled += 1;
        this.logger.log(
          `Auto-cancelled underfilled match ${row.id} (${row.total_players}/${row.min_players} players, refunded=${refundedSar} SAR, slotReleased=${releasedSlot}).`,
        );
      } catch (err) {
        this.logger.error(
          `Auto-cancel failed for match ${row.id}: ${(err as Error).message}`,
        );
      }
    }

    if (nudged > 0 || cancelled > 0) {
      this.logger.log(
        `Underfill scheduler: nudged ${nudged} host(s), auto-cancelled ${cancelled} match(es).`,
      );
    }
    return { nudged, cancelled };
  }

  /** Tally POTM votes for one match (POTM invariant: roster member, no no-show). */
  private async tallyPomVotes(matchId: string): Promise<
    Array<{
      candidate_id: string;
      full_name: string | null;
      avatar_url: string | null;
      vote_count: number;
    }>
  > {
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
    return voteCounts as unknown as Array<{
      candidate_id: string;
      full_name: string | null;
      avatar_url: string | null;
      vote_count: number;
    }>;
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
  async findNearby(
    dto: GetMatchesDto,
    currentUserId?: string,
  ): Promise<{ matches: NearbyMatchRow[]; total?: number; hasMore: boolean }> {
    const {
      lat,
      lng,
      radius_km = 50,
      date,
      format,
      gender,
      max_price,
      venue_id,
      time,
      limit,
      offset,
    } = dto;

    if ((lat === undefined) !== (lng === undefined)) {
      throw new BadRequestException('Both lat and lng must be provided together.');
    }

    const hasCoords = lat !== undefined && lng !== undefined;

    // ── Date window filter (Riyadh local day, matches the PWA's dateInRiyadh) ──
    const dateClause = date
      ? sql`AND (m.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = ${date}::date`
      : sql``;

    // ── Time-of-day window filter (Riyadh local hour of scheduled_at; run #12).
    // `night` wraps past midnight ([23→04)) so the OR-form is used there.
    const timeClause = time
      ? TIME_WINDOWS[time].startHour <= TIME_WINDOWS[time].endHour
        ? sql`AND EXTRACT(HOUR FROM (m.scheduled_at AT TIME ZONE 'Asia/Riyadh')) >= ${TIME_WINDOWS[time].startHour}
             AND EXTRACT(HOUR FROM (m.scheduled_at AT TIME ZONE 'Asia/Riyadh')) < ${TIME_WINDOWS[time].endHour}`
        : sql`AND (EXTRACT(HOUR FROM (m.scheduled_at AT TIME ZONE 'Asia/Riyadh')) >= ${TIME_WINDOWS[time].startHour}
             OR EXTRACT(HOUR FROM (m.scheduled_at AT TIME ZONE 'Asia/Riyadh')) < ${TIME_WINDOWS[time].endHour})`
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

    // ── Gender filter — normalize PWA tokens (men|women|mixed) to the DB
    // GenderRule enum ('Men Only' | 'Women Only' | 'Mixed') before matching.
    // The query contract accepts both forms; see GetMatchesDto.GENDER_QUERY_VALUES.
    const genderClause = gender
      ? sql`AND m.gender_rule = ${normalizeGenderRule(gender)}`
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
        ) + INTERVAL '24 hours'    AS voting_closes_at,
        COUNT(*) OVER()::int       AS total_count
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
        ${timeClause}
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
      LIMIT ${limit ?? 50}
      OFFSET ${offset ?? 0}
    `);

    // Envelope contract (P1-19): total_count is the pre-LIMIT match count
    // (window function, computed after WHERE/GROUP BY), so the client can
    // page without a second COUNT query. hasMore ⇒ another page exists.
    const list = rows as unknown as (NearbyMatchRow & { total_count?: number })[];
    const total = typeof list[0]?.total_count === 'number' ? list[0].total_count : undefined;
    const items = list.map(({ total_count: _tc, ...rest }) => rest);
    return {
      matches: items as NearbyMatchRow[],
      total,
      hasMore: (offset ?? 0) + items.length < (total ?? 0),
    };
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

  async findOne(matchId: string, viewerId?: string) {
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

    // Access control (P0-1): chat is members-only — the WS layer already enforces
    // membership on every chat path (join-lobby, send-message); the REST read path
    // must match. Non-member viewers (invite-link holders browsing a private match,
    // or the public browsing an open one) still get full match metadata, but the
    // embedded chat history is stripped. Internal callers pass no viewer and are
    // unaffected.
    if (viewerId) {
      const isMember = await this.isMatchMember(matchId, viewerId);
      if (!isMember) {
        match.messages = [];
      }
    }

    return match;
  }

  /**
   * Membership probe shared by REST chat reads. Host counts as a member.
   */
  private async isMatchMember(
    matchId: string,
    userId: string,
  ): Promise<boolean> {
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
    return Boolean(membership);
  }

  /**
   * Minimal match projection for the ICS/calendar route (P2-22, run #13).
   * Private matches are MEMBERS-ONLY here — unlike findOne, whose metadata
   * stays readable for invite-link holders. A calendar file/redirect carries
   * the title + venue ADDRESS and leaves the user's control (downloaded or
   * handed to Google), so it is an export, not a page view: the venue address
   * must not leak to non-members. Public matches need no membership.
   */
  async getCalendarMatch(matchId: string, viewerId: string) {
    const match = await this.db.query.matches.findFirst({
      where: eq(matches.id, matchId),
      columns: {
        id: true,
        title: true,
        match_type: true,
        gender_rule: true,
        scheduled_at: true,
        duration_mins: true,
        visibility: true,
        host_id: true,
      },
      with: {
        pitch: {
          with: {
            venue: {
              columns: { name: true, address: true },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found.`);
    }

    if (match.visibility === 'private' && match.host_id !== viewerId) {
      const isMember = await this.isMatchMember(matchId, viewerId);
      if (!isMember) {
        throw new ForbiddenException(
          'This match is private — only its players can export the calendar.',
        );
      }
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
    // Set inside the tx when this withdrawal drops the roster below minimum —
    // drives the immediate host re-nudge after commit.
    let needsRenudge: { hostId: string; needed: number } | null = null;
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

      // 3. If match was Full, revert to Open. Also capture host/min info so
      //    the post-tx underfill re-nudge can fire when the total drops below
      //    minimum (armed hourly nudge resets → host hears about it now).
      const [match] = await tx
        .select({
          status: matches.status,
          host_id: matches.host_id,
          min_players: matches.min_players,
          total_players: sql<number>`(SELECT COUNT(*)::int FROM ${schema.match_players} mp WHERE mp.match_id = ${matches.id})`,
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (match?.status === 'Full') {
        await tx
          .update(matches)
          .set(withTimestamp({ status: 'Open' }))
          .where(eq(matches.id, matchId));
      }

      // Below minimum after this withdrawal → re-arm the hourly nudge clock
      // so the scheduler's next tick may nudge again, and remember the state
      // for the immediate post-tx notification.
      if (match && match.min_players > 0 && match.total_players < match.min_players) {
        await tx
          .update(matches)
          .set(withTimestamp({ last_nudge_at: null }))
          .where(eq(matches.id, matchId));
        needsRenudge = {
          hostId: match.host_id,
          needed: match.min_players - match.total_players,
        };
      }
    });

    // Underfill re-nudge: tell the host immediately that the match dropped
    // below minimum (bell + push). Best-effort. (Re-annotate to defeat TS
    // closure-narrowing: the assignment happens inside the tx callback.)
    const renudge = needsRenudge as { hostId: string; needed: number } | null;
    if (renudge) {
      const [hostMatch] = await this.db
        .select({ title: matches.title })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);
      try {
        await this.activitiesService.record({
          actorId: userId,
          verb: 'host_underfilled_nudge',
          matchId,
          recipients: [renudge.hostId],
          excludeActor: false,
        });
        await this.notificationsService.sendPushToUsers([renudge.hostId], {
          key: 'players_needed_renudge', // P2-8: text localized per subscriber
          vars: { title: hostMatch?.title, needed: renudge.needed },
          data: { type: 'match-chat', matchId },
        });
      } catch (err) {
        this.logger.error(`Underfill re-nudge failed for ${matchId}: ${(err as Error).message}`);
      }
    }

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
    // Underfill protection: minimum total players (host included) needed for
    // the match to be played. Always even, max−2 by product rule
    // (5v5→8, 7v7→12, 11v11→20), floored at 2. Server-authoritative —
    // the client never sets it.
    const minPlayers = MatchesService.minPlayersFor(dto.max_players);

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
          min_players: minPlayers,
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
  async getMessages(matchId: string, viewerId?: string) {
    // Access control (P0-1): chat history is members-only, mirroring the WS
    // gateway's join-lobby/send-message membership enforcement. Internal
    // callers (none today) may omit the viewer.
    if (viewerId) {
      const isMember = await this.isMatchMember(matchId, viewerId);
      if (!isMember) {
        throw new ForbiddenException(
          'You are not a member of this match.',
        );
      }
    }

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
      .onConflictDoNothing()
      .returning();

    // Concurrent retry won the race (unique index match_messages_client_msg_uidx
    // on (user_id, match_id, client_message_id) WHERE client_message_id IS NOT NULL):
    // return the row the winner inserted instead of raising a unique-violation 500.
    if (!inserted) {
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
      throw new ConflictException('Message send conflicted; retry.');
    }

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
   * Host lifecycle timing windows — mirrored in the PWA `lib/match-timing.ts`.
   * Keep these values in sync across both codebases.
   */

  /** Host may start a match this many minutes before kick-off (no earlier). */
  private static readonly START_EARLY_WINDOW_MINUTES = 30;

  /** Host may end a match this many minutes before the scheduled end (no earlier). */
  private static readonly END_EARLY_WINDOW_MINUTES = 30;

  /**
   * Start a match: Full → InProgress. Only the host may transition.
   */
  async startMatch(userId: string, matchId: string) {
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

      if (match.host_id !== userId) {
        throw new ForbiddenException('Only the match host can start the match.');
      }

      if (match.status !== 'Full') {
        throw new BadRequestException(
          `Cannot start a match with status "${match.status}". Match must be Full.`,
        );
      }

      // Timing gate: a match cannot be started earlier than 30 minutes before
      // kick-off. Mirrored in the PWA `lib/match-timing.ts`.
      const earliestStart =
        match.scheduled_at.getTime() -
        MatchesService.START_EARLY_WINDOW_MINUTES * 60_000;
      if (Date.now() < earliestStart) {
        throw new BadRequestException(
          `Match can only be started ${MatchesService.START_EARLY_WINDOW_MINUTES} minutes before kick-off.`,
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
        .select({
          id: matches.id,
          host_id: matches.host_id,
          status: matches.status,
          scheduled_at: matches.scheduled_at,
          duration_mins: matches.duration_mins,
        })
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

      // Timing gate: a match cannot be ended earlier than 30 minutes before its
      // scheduled end. Mirrored in the PWA `lib/match-timing.ts`.
      const scheduledEndMs =
        match.scheduled_at.getTime() + match.duration_mins * 60_000;
      const earliestEnd =
        scheduledEndMs - MatchesService.END_EARLY_WINDOW_MINUTES * 60_000;
      if (Date.now() < earliestEnd) {
        throw new BadRequestException(
          `Match can only be ended ${MatchesService.END_EARLY_WINDOW_MINUTES} minutes before the scheduled end.`,
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
      // FOR UPDATE row lock — serializes against rescheduleMatch, which moves
      // booking_slot_id between this read and the release below. Without the
      // lock, a committed reschedule in between leaves cancel holding a STALE
      // slot id: the (now-freed) old slot fails the is_booked check and the
      // host's refund is silently skipped while the match still cancels.
      const [match] = await tx.execute(sql`
        SELECT id, host_id, status, booking_mode, booking_slot_id,
               pitch_cost_sar, price_per_player, max_players
        FROM matches
        WHERE id = ${matchId}::text
        FOR UPDATE
      `).then((r: unknown) => (r as { rows?: unknown[] }).rows ?? r) as Array<{
        id: string; host_id: string; status: string;
        booking_mode: string; booking_slot_id: string | null;
        pitch_cost_sar: string | null; price_per_player: string; max_players: number;
      }>;

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
   * Reschedule a koralink match: move it to a different FREE slot on the SAME
   * pitch (roster, chat and title preserved — the cancel+recreate path loses
   * all three). Host only, pre-match only (Open/Full).
   *
   * One transaction: lock old+new slots FOR UPDATE, release old + refund the
   * host exactly the persisted `pitch_cost_sar`, book new + charge the new
   * slot's cost (net delta applied to the wallet with a balance-floor check),
   * update scheduled_at/duration_mins/price_per_player with the SAME server-
   * authoritative derivation createMatch uses (so the scheduler's ticks and
   * the pricing tests keep holding). findOne OUTSIDE tx (contract §2).
   */
  async rescheduleMatch(userId: string, matchId: string, dto: UpdateMatchScheduleDto) {
    let walletDeltaSar = 0;
    // Per-attempt ledger keys. The slot-state check + match-row FOR UPDATE
    // lock already serialize concurrent attempts (a loser sees the match on
    // its target slot and 400s BEFORE any money moves), so keys must NOT be
    // deterministic per (match, slot): a host legally moving A→B→A would
    // otherwise hit the transactions unique constraint on the second visit.
    // UUID suffix — collision-free even in the same millisecond (reviewer).
    const attemptId = randomUUID();
    // Hoisted from the tx closure so the post-commit return can reference
    // them (closure-scoped lets would fall out of scope).
    let oldSlotId: string | null = null;
    let newSlotId = dto.booking_slot_id;

    await this.db.transaction(async (tx) => {
      // ── 0. Lock the match row + authorize ────────────────────────────
      const [match] = await tx.execute(sql`
        SELECT id, host_id, status, booking_mode, booking_slot_id,
               pitch_id, pitch_cost_sar, price_per_player, max_players
        FROM matches
        WHERE id = ${matchId}::text
        FOR UPDATE
      `).then((r: unknown) => (r as { rows?: unknown[] }).rows ?? r) as Array<{
        id: string; host_id: string; status: string;
        booking_mode: string; booking_slot_id: string | null;
        pitch_id: string; pitch_cost_sar: string | null;
        price_per_player: string; max_players: number;
      }>;

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }
      if (match.host_id !== userId) {
        throw new ForbiddenException('Only the match host can reschedule the match.');
      }
      if (match.booking_mode !== 'koralink' || !match.booking_slot_id) {
        throw new BadRequestException(
          'Only koralink-booked matches (with a pitch slot) can be rescheduled.',
        );
      }
      if (match.status !== 'Open' && match.status !== 'Full') {
        throw new BadRequestException(
          `Cannot reschedule a match with status "${match.status}". Match must be Open or Full.`,
        );
      }
      if (dto.booking_slot_id === match.booking_slot_id) {
        throw new BadRequestException('The match is already booked on that slot.');
      }

      // ── 1. Lock BOTH slots FOR UPDATE (old + new, ordered by id — no
      //      lock-order deadlocks between concurrent reschedules) ────────
      const slotRows = await tx.execute(sql`
        SELECT id, pitch_id, slot_date, start_time, end_time, is_booked
        FROM pitch_slots
        WHERE id IN (${match.booking_slot_id}::text, ${dto.booking_slot_id}::text)
        ORDER BY id
        FOR UPDATE
      `).then((r: unknown) => (r as { rows?: unknown[] }).rows ?? r) as Array<{
        id: string; pitch_id: string; slot_date: string;
        start_time: string; end_time: string; is_booked: boolean;
      }>;

      const oldSlot = slotRows.find((s) => s.id === match.booking_slot_id);
      const newSlot = slotRows.find((s) => s.id === dto.booking_slot_id);

      if (!oldSlot) {
        throw new NotFoundException(`Slot ${match.booking_slot_id} not found.`);
      }
      if (!newSlot) {
        throw new NotFoundException(`Slot ${dto.booking_slot_id} not found.`);
      }
      oldSlotId = oldSlot.id;
      newSlotId = newSlot.id;
      if (newSlot.pitch_id !== match.pitch_id) {
        throw new BadRequestException('Slots can only be swapped within the same pitch.');
      }
      if (newSlot.is_booked) {
        throw new ConflictException('This slot has already been booked by another host');
      }

      // ── 2. Derive the new schedule exactly like createMatch does ──────
      // slot_date = YYYY-MM-DD (Riyadh-local), start/end = HH:MM(:SS). The
      // same local wall clock → UTC mapping the PWA uses at create time
      // (Riyadh is UTC+3, DST-free → fixed offset is exact).
      const newScheduledAt = new Date(`${newSlot.slot_date}T${newSlot.start_time.slice(0, 5)}:00+03:00`);
      const toMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const newDuration = toMins(newSlot.end_time) - toMins(newSlot.start_time);
      if (newDuration <= 0) {
        throw new BadRequestException('Slot window is invalid (end must be after start).');
      }

      // Cross-day reschedule (run #21): the picker now reaches ANY day, so a
      // past slot must be rejected BEFORE any money moves — landing the match
      // on a past instant would let the */5m auto-complete scheduler finish it
      // immediately. Riyadh is UTC+3 (DST-free) → the same +03:00 wall-clock
      // mapping createMatch uses is exact.
      if (newScheduledAt.getTime() <= Date.now()) {
        throw new BadRequestException('Cannot reschedule the match to a slot in the past.');
      }

      // P2-37 (run #21): defense-in-depth — max_players is DTO-floored ≥2 at
      // create (create-match.dto.ts @Min(2)), but a drifted/legacy row with
      // max_players < 2 would make the per-player pricing divide by zero and
      // persist Infinity/NaN. Guard sits BEFORE money moves (like duration/
      // past-slot guards) so nothing is refunded/charged on a broken row.
      if (match.max_players < 2) {
        throw new BadRequestException('Cannot price a match with fewer than 2 players.');
      }

      // ── 3. Money: refund old cost, charge new cost, net the wallet ────
      const oldCost = match.pitch_cost_sar ? parseFloat(match.pitch_cost_sar) : 0;
      const [pitch] = await tx
        .select({ hourly_rate: pitches.hourly_rate })
        .from(pitches)
        .where(eq(pitches.id, match.pitch_id))
        .limit(1);
      if (!pitch) {
        throw new NotFoundException(`Pitch ${match.pitch_id} not found.`);
      }
      const newCost = round2(parseFloat(String(pitch.hourly_rate)) * (newDuration / 60));

      walletDeltaSar = round2(newCost - oldCost);

      // Release old slot + refund the host the exact debited amount.
      // Guarded: a null/zero pitch_cost_sar (legacy rows) must not produce a
      // zero-amount CREDIT row (post-cycle review, run #20).
      await tx
        .update(pitch_slots)
        .set(withTimestamp({ is_booked: false, booked_match_id: null }))
        .where(eq(pitch_slots.id, oldSlot.id));

      if (oldCost > 0) {
        await tx.insert(transactions).values({
          user_id: userId,
          type: 'CREDIT',
          amount: oldCost.toString(),
          reference_type: 'REFUND',
          reference_id: matchId,
          idempotency_key: `reschedule-refund-${matchId}-${newSlot.id}-${attemptId}`,
          status: 'Completed',
        }).onConflictDoNothing();
      }

      // Book new slot + charge the new cost.
      await tx
        .update(pitch_slots)
        .set(withTimestamp({ is_booked: true, booked_match_id: matchId }))
        .where(eq(pitch_slots.id, newSlot.id));

      await tx.insert(transactions).values({
        user_id: userId,
        type: 'DEBIT',
        amount: newCost.toString(),
        reference_type: 'PITCH_BOOKING',
        reference_id: matchId,
        idempotency_key: `reschedule-charge-${matchId}-${newSlot.id}-${attemptId}`,
        status: 'Completed',
      }).onConflictDoNothing();

      // Net wallet movement with a balance floor (a reschedule may cost MORE
      // if the new slot is longer / pricier — the host must cover it).
      if (walletDeltaSar !== 0) {
        const [wallet] = await tx
          .select({ wallet_balance: users.wallet_balance })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (walletDeltaSar > 0 && (!wallet || parseFloat(wallet.wallet_balance) < walletDeltaSar)) {
          throw new BadRequestException(
            `Insufficient wallet balance for the reschedule. Required: SAR ${walletDeltaSar.toFixed(2)}, Available: SAR ${parseFloat(wallet?.wallet_balance ?? '0').toFixed(2)}`,
          );
        }

        await tx
          .update(users)
          .set({
            wallet_balance: sql`${users.wallet_balance} + ${walletDeltaSar.toString()}`,
            updated_at: new Date(),
          })
          .where(eq(users.id, userId));
      }

      // ── 4. Update the match row (server-authoritative pricing mirror) ──
      const newMax = match.max_players;
      const newPricePerPlayer = round2(newCost / (newMax - 1) + PLATFORM_MARGIN_SAR);

      await tx
        .update(matches)
        .set(
          withTimestamp({
            scheduled_at: newScheduledAt,
            duration_mins: newDuration,
            pitch_cost_sar: newCost.toString(),
            price_per_player: newPricePerPlayer.toString(),
            booking_slot_id: newSlot.id,
          }),
        )
        .where(eq(matches.id, matchId));
    });

    // ── 5. Post-commit: populated response + fan-out (best-effort) ──────
    const updatedMatch = await this.findOne(matchId);

    try {
      this.appGateway.broadcastStatusUpdate(matchId, updatedMatch);
    } catch (err) {
      this.logger.error(`WS broadcast error on rescheduleMatch: ${(err as Error).message}`);
    }

    // Roster notification — recipients are the players (the actor is the
    // host), so excludeActor=true; the host already knows he moved it.
    try {
      const rosterIds = (updatedMatch.players ?? [])
        .map((p) => p.user.id)
        .filter((pid) => pid !== userId);

      await this.activitiesService.record({
        actorId: userId,
        verb: 'match_rescheduled',
        matchId,
        recipients: rosterIds,
        excludeActor: true,
      });
      await this.notificationsService.sendPushToUsers(rosterIds, {
        key: 'match_rescheduled', // P2-8: text localized per subscriber
        vars: { title: updatedMatch.title },
        data: { type: 'match-chat', matchId },
      });
    } catch (err) {
      this.logger.error(`rescheduleMatch notification failed for ${matchId}: ${(err as Error).message}`);
    }

    this.logger.log(
      `match_rescheduled matchId=${matchId} newSlot=${dto.booking_slot_id} walletDeltaSar=${walletDeltaSar}`,
      MatchesService.name,
    );

    return { ...updatedMatch, reschedule: { old_slot_id: oldSlotId, new_slot_id: newSlotId, wallet_delta_sar: walletDeltaSar } };
  }

  /**
   * Mark a player as no-show (or unmark). Host only.
   */
  async markNoShow(hostId: string, matchId: string, targetUserId: string, noShow: boolean) {
    const graceMins = await this.settings.getNumber('grace_period_mins', 0);
    // A host can never be a no-show in his own match — the roster row is his
    // attendance record, not a target. Reject early, before any side effects.
    if (targetUserId === hostId) {
      throw new BadRequestException('You cannot mark yourself as a no-show.');
    }
    let wasFlagged = false; // player's no_show state BEFORE this call
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

      wasFlagged = player.no_show;

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

        if (noShow) {
          // The mark itself auto-opens a dispute so it lands in the admin
          // review queue immediately — the player attaches their appeal to
          // it afterwards. Without this, marks silently pile up with no
          // operator visibility.
          const [existingOpen] = await tx
            .select({ id: disputes.id })
            .from(disputes)
            .where(
              and(
                eq(disputes.match_id, matchId),
                eq(disputes.reporter_id, targetUserId),
                eq(disputes.type, 'no_show'),
                inArray(disputes.status, ['opened', 'under_review']),
              ),
            )
            .limit(1);

          if (!existingOpen) {
            await tx.insert(disputes).values({
              match_id: matchId,
              reporter_id: targetUserId,
              respondent_id: match.host_id,
              type: 'no_show',
              status: 'opened',
              evidence: [
                {
                  action: 'marked_no_show',
                  by: match.host_id,
                  at: new Date().toISOString(),
                },
              ],
            });
          }
        } else {
          // Host cleared the mark — close the auto-opened dispute so the
          // admin queue never shows stale entries. Only 'opened' rows close
          // (P1-21): a dispute already taken by an admin ('under_review') is
          // an in-flight human review and must not be silently rejected just
          // because the host backed out.
          await tx
            .update(disputes)
            .set(
              withTimestamp({
                status: 'rejected',
                decision: 'Host cleared the no-show mark.',
              }),
            )
            .where(
              and(
                eq(disputes.match_id, matchId),
                eq(disputes.reporter_id, targetUserId),
                eq(disputes.type, 'no_show'),
                eq(disputes.status, 'opened'),
              ),
            );
        }
      }
    });

    const updatedMatch = await this.findOne(matchId);
    try {
      this.appGateway.broadcastRosterUpdate(matchId, updatedMatch);
      // Ops consoles (no-show counts show in the admin users/matches tables).
      this.realtime.broadcastOps('users');
      this.realtime.broadcastOps('matches');
    } catch (err) {
      this.logger.error(`WS broadcast error on markNoShow: ${(err as Error).message}`);
    }

    // ── Marked player notification — the banner only reaches them if they
    // reopen the match; the bell reaches them anywhere. Best-effort.
    // Only on an actual new MARK — clearing a mark must not say "you were
    // marked". (record() additionally never delivers no_show_marked to the
    // actor, so a self-mark can never notify the host either.) ──
    if (noShow && !wasFlagged) {
      try {
        await this.activitiesService.record({
          actorId: hostId,
          verb: 'no_show_marked',
          matchId,
          recipients: [targetUserId],
          excludeActor: false,
        });
      } catch {
        // best-effort
      }
    }

    return updatedMatch;
  }

  /**
   * Host removes a player from the roster (P1-24). Pre-match only: once a
   * match is InProgress/Completed the roster is the attendance record and
   * the no-show flow (markNoShow + dispute) is the correct lever instead.
   * The host cannot "remove" themselves — cancelling is that flow's exit.
   * Full → Open so the freed spot is immediately joinable; the removed
   * player is told via a directed activity (bell/feed) + best-effort push.
   * Returns the fully populated match (API Contract Rule §2), findOne OUTSIDE tx.
   */
  async removePlayer(hostId: string, matchId: string, targetUserId: string) {
    if (targetUserId === hostId) {
      throw new BadRequestException(
        'Hosts cannot remove themselves — cancel the match instead.',
      );
    }

    await this.db.transaction(async (tx) => {
      const [match] = await tx
        .select({
          id: matches.id,
          host_id: matches.host_id,
          status: matches.status,
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!match) {
        throw new NotFoundException(`Match ${matchId} not found.`);
      }

      if (match.host_id !== hostId) {
        throw new ForbiddenException('Only the match host can remove players.');
      }

      if (match.status === 'InProgress' || match.status === 'Completed') {
        throw new BadRequestException(
          'Players can only be removed before the match starts.',
        );
      }

      const [player] = await tx
        .select({ id: schema.match_players.id })
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
        .delete(schema.match_players)
        .where(eq(schema.match_players.id, player.id));

      if (match.status === 'Full') {
        await tx
          .update(matches)
          .set(withTimestamp({ status: 'Open' }))
          .where(eq(matches.id, matchId));
      }
    });

    const updatedMatch = await this.findOne(matchId);
    try {
      this.appGateway.broadcastRosterUpdate(matchId, updatedMatch);
      this.appGateway.broadcastStatusUpdate(matchId, updatedMatch);
    } catch (err) {
      this.logger.error(`WS broadcast error on removePlayer: ${(err as Error).message}`);
    }

    // Removed-player notification — record() fans out to feed + bell. The
    // recipient is the TARGET (not the actor), so excludeActor stays false.
    // Best-effort: the removal itself is already committed.
    try {
      await this.activitiesService.record({
        actorId: hostId,
        verb: 'player_removed',
        matchId,
        recipients: [targetUserId],
        excludeActor: false,
      });
      await this.notificationsService.sendPushToUsers([targetUserId], {
        key: 'player_removed', // P2-8: text localized per subscriber
        vars: { title: updatedMatch.title },
        data: { type: 'match-chat', matchId },
      });
    } catch (err) {
      this.logger.error(`removePlayer notification failed for ${matchId}: ${(err as Error).message}`);
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

    // Attach the player's appeal as evidence on an existing open/reviewing
    // dispute (e.g. the host's mark already auto-opened it) rather than
    // creating a duplicate row.
    const attachAppeal = async (disputeId: string, existingEvidence: unknown) => {
      const evidence = Array.isArray(existingEvidence) ? [...existingEvidence] : [];
      evidence.push({
        action: 'appeal',
        reason: dto.reason ?? '(no reason provided)',
        at: new Date().toISOString(),
      });
      const [updated] = await this.db
        .update(disputes)
        .set({ evidence: evidence as never })
        .where(eq(disputes.id, disputeId))
        .returning();
      return updated;
    };

    const [existing] = await this.db
      .select({ id: disputes.id, status: disputes.status, evidence: disputes.evidence })
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
      return attachAppeal(existing.id, existing.evidence);
    }

    // Insert guarded by the partial unique index `disputes_open_uidx` on
    // (match_id, reporter_id, type) WHERE status IN ('opened','under_review').
    // `onConflictDoNothing` makes the write atomic — a concurrent duplicate
    // appeal returns zero rows instead of inserting a second dispute.
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
      .onConflictDoNothing()
      .returning();

    if (!created) {
      // A concurrent appeal won the race — re-read the winner's row and attach
      // this appeal as evidence instead of duplicating the dispute.
      const [winner] = await this.db
        .select({ id: disputes.id, evidence: disputes.evidence })
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

      if (winner) {
        return attachAppeal(winner.id, winner.evidence);
      }
      throw new ConflictException('Dispute conflicted; retry.');
    }

    try {
      this.realtime.broadcastOps('disputes');
    } catch (err) {
      this.logger.warn(`ops ping failed on createDispute: ${(err as Error).message}`);
    }

    return created;
  }

  /**
   * The current user's most recent dispute on a match (any status), or null.
   * Powers the PWA appeal banner: "under review", "resolved", etc.
   * `has_appealed` distinguishes the host's auto-opened mark dispute from one
   * the player has actually attached their appeal to.
   */
  async findMyDispute(userId: string, matchId: string) {
    const [dispute] = await this.db
      .select({
        id: disputes.id,
        type: disputes.type,
        status: disputes.status,
        decision: disputes.decision,
        evidence: disputes.evidence,
        created_at: disputes.created_at,
        updated_at: disputes.updated_at,
      })
      .from(disputes)
      .where(and(eq(disputes.match_id, matchId), eq(disputes.reporter_id, userId)))
      .orderBy(sql`${disputes.created_at} DESC`)
      .limit(1);

    if (!dispute) return null;

    const evidence = Array.isArray(dispute.evidence) ? dispute.evidence : [];
    const hasAppealed = evidence.some(
      (e) => (e as { action?: string }).action === 'appeal',
    );

    return {
      id: dispute.id,
      type: dispute.type,
      status: dispute.status,
      decision: dispute.decision,
      has_appealed: hasAppealed,
      created_at: dispute.created_at,
      updated_at: dispute.updated_at,
    };
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
