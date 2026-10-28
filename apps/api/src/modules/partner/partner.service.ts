import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import {
  matches,
  match_players,
  pitch_slots,
  pitches,
  settlements,
  users,
  venue_verifications,
  venues,
} from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { quantizeMoney2dpString } from '../../common/utils/money';
import { AuditService } from '../admin/audit.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CreatePitchDto } from './dto/create-pitch.dto';
import { UpdatePitchDto } from './dto/update-pitch.dto';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { BlackoutSlotsDto, CreateSlotDto, GenerateSlotsDto, UpdateVenuePartnerDto } from './dto/slots.dto';
import { RealtimeService } from '../gateway/realtime.service';
import { MailerService } from '../mailer/mailer.service';
import { Optional } from '@nestjs/common';
import { reportFanOutError } from '../../common/utils/fanout';

type DB = PostgresJsDatabase<typeof schema>;

const UPCOMING_STATUSES = sql`${matches.status} IN ('Open', 'Full', 'InProgress')`;

/** P1-25: how many dur-minute slots fit in [startMins, endMins). */
function windowCapacity(startMins: number, endMins: number, dur: number): number {
  return endMins > startMins ? Math.floor((endMins - startMins) / dur) : 0;
}

/** Asia/Riyadh helpers live in common/utils/riyadh-date (P2-216 hex extract).
 * Re-exported here for spec compat — specs import these from './partner.service'.
 */
export {
  EARNINGS_TREND_WEEKS,
  RIYADH_OFFSET_MS,
  addDaysToDateString,
  riyadhDateString,
  riyadhTrendDays,
  riyadhTrendWeeks,
} from '../../common/utils/riyadh-date';
import {
  EARNINGS_TREND_WEEKS,
  addDaysToDateString,
  riyadhDateString,
  riyadhTrendDays,
  riyadhTrendWeeks,
} from '../../common/utils/riyadh-date';
import { buildSettlementRevenueQuery } from './settlement-revenue';

export interface EarningsVenueRevenue {
  venueId: string;
  venueName: string;
  bookedCount: number;
  revenue: string;
}

export interface EarningsTrendWeek {
  weekStart: string;
  revenue: string;
  bookedCount: number;
}

const ZERO_MONEY = '0.00';

function zeroTrendWeeks(weeks: string[]): EarningsTrendWeek[] {
  return weeks.map((weekStart) => ({ weekStart, revenue: ZERO_MONEY, bookedCount: 0 }));
}

function normalizeVenueRevenue(r: EarningsVenueRevenue): EarningsVenueRevenue {
  return {
    venueId: String(r.venueId),
    venueName: String(r.venueName ?? ''),
    bookedCount: Number(r.bookedCount),
    revenue: String(r.revenue),
  };
}

@Injectable()
export class PartnerService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly realtime: RealtimeService,
    // Optional at the type level so legacy spec constructions compile; the
    // real DI graph (PartnerModule) always provides AuditService.
    private readonly audit?: AuditService,
    // Optional for the same reason; SettingsModule is @Global so the real DI
    // graph always provides it. Undefined (legacy specs) → cadence fallback 7.
    private readonly settings?: PlatformSettingsService,
    // Partner email lane (run #165): optional 5th param, same legacy-spec
    // pattern. Undefined (tests) → no payout-request email is attempted.
    @Optional() private readonly mailer?: MailerService,
  ) {}

  /** Venue ids an actor may see — Admins scope to ALL venues (support/moderation). */
  private async scopedVenueIds(ownerId: string, actorRole?: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: venues.id })
      .from(venues)
      .where(actorRole === 'Admin' ? sql`true` : eq(venues.owner_id, ownerId));
    return rows.map((r) => r.id);
  }

  /** Pitch ids an actor may see — Admins scope to ALL pitches (support/moderation). */
  private async scopedPitchIds(ownerId: string, actorRole?: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: pitches.id })
      .from(pitches)
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .where(actorRole === 'Admin' ? sql`true` : eq(venues.owner_id, ownerId));
    return rows.map((r) => r.id);
  }

  /**
   * P2-3 (run #138): partner-initiated payout REQUEST.
   *
   * Creates ONE `pending` settlement per venue that has unsettled completed
   * KoraLink-booked revenue (same money source + NOT-EXISTS shape as the
   * admin generator). Moves NO money and pays NOTHING — admin `pay()` stays
   * the only settlement action (P0-2/DECISIONS.md untouched). The unique
   * `(venue_id, period_start)` index + onConflictDoNothing close the
   * double-request race; the venue-row FOR UPDATE lock serializes against a
   * concurrent admin `generatePending` window (P2-105 lock idiom).
   * P2-216 (run #163): window + dedupe guard ride the SHARED
   * buildSettlementRevenueQuery (./settlement-revenue.ts) — the admin
   * generator renders the identical SQL, and the venue lock is now ordered
   * (ORDER BY id FOR UPDATE) so concurrent request/generate runs can never
   * deadlock on multi-row lock acquisition.
   */
  async requestPayout(
    ownerId: string,
    actorRole?: string,
  ): Promise<{
    requested: number;
    totalAmount: string;
    settlements: Array<{
      id: string;
      venueId: string;
      venueName: string;
      amount: string;
      periodStart: string;
      periodEnd: string;
      status: string;
    }>;
  }> {
    if (actorRole === 'Admin') {
      // Admins already own the generator (POST /admin/settlements/generate);
      // the request route is the PARTNER action.
      throw new ForbiddenException('Admins use the settlement generator instead.');
    }

    // P2-211: window + dedupe guard MUST mirror the admin generator's money
    // source — admin settlements.service.ts keys BOTH to the rolling
    // `payout_cadence_days` PlatformSetting (default 7). Hardcoding 365d here
    // structurally locked a venue out of requesting new unsettled revenue for
    // up to a year after its first request (silent 400 dead-end).
    const cadenceDays = this.settings
      ? await this.settings.getNumber('payout_cadence_days', 7)
      : 7;

    // One tx: lock the partner's venue rows FIRST (blocks a concurrent
    // generate/request window for the same venues until commit), then compute
    // unsettled revenue and insert.
    // P2-216 (run #163): the lock is deterministic — ORDER BY id BEFORE the
    // FOR UPDATE — so two concurrent requests (or a partner request + admin
    // generate) always acquire the venue rows in the same order. Multi-row
    // locks without a shared order can deadlock.
    const created = await this.db.transaction(async (tx) => {
      const venueRows = (await tx
        .select({ id: venues.id, name: venues.name })
        .from(venues)
        .where(eq(venues.owner_id, ownerId))
        .orderBy(asc(venues.id))
        .for('update')) as Array<{ id: string; name: string }>;
      if (!venueRows.length) return [] as Array<{ id: string; venueId: string; venueName: string; amount: string; periodStart: string; periodEnd: string; status: string }>;

      // P2-216 (run #163): ONE window definition shared with the admin
      // generator — rolling start instant + Riyadh-day end, computed in JS
      // (never the DB server's timezone) — and an INTERVAL-OVERLAP dedupe
      // guard: a past settlement whose window [period_start, period_end]
      // overlaps [startDay, riyadhEnd] blocks this venue. The old
      // `period_start >= windowStart` guard missed overlaps when the two
      // paths keyed different period_start values (UTC vs Riyadh, or a
      // different cadence read); overlap semantics are axis-agnostic.
      const riyadhEnd = riyadhDateString();

      const rows = (await tx.execute(buildSettlementRevenueQuery({
        venueIds: venueRows.map((v) => v.id),
        cadenceDays,
        riyadhEnd,
      }))) as unknown as Array<{ venue_id: string; amount: string }>;

      const nameById = new Map(venueRows.map((v) => [v.id, v.name]));
      const out: Array<{ id: string; venueId: string; venueName: string; amount: string; periodStart: string; periodEnd: string; status: string }> = [];
      for (const row of rows) {
        // Postgres exact-decimal string — quantized, never a float (P2-4 rule).
        const amount = quantizeMoney2dpString(row.amount);
        const [settlement] = await tx
          .insert(settlements)
          .values({
            venue_id: row.venue_id,
            amount,
            // P2-216 (run #163): the request covers [startDay, riyadhEnd] on
            // the Riyadh axis — stamp the TRUE window, not today twice, so the
            // overlap guard and console read-model see the real coverage.
            period_start: addDaysToDateString(riyadhEnd, -cadenceDays),
            period_end: riyadhEnd,
            status: 'pending',
            // P2-C (run #143): provenance — this row exists because the partner
            // asked for it. NULL stays the auto-generator's signature.
            requested_by: ownerId,
          })
          .onConflictDoNothing()
          .returning();
        if (settlement) {
          out.push({
            id: settlement.id,
            venueId: row.venue_id,
            venueName: nameById.get(row.venue_id) ?? '',
            amount: settlement.amount,
            periodStart: settlement.period_start,
            periodEnd: settlement.period_end,
            status: settlement.status,
          });
        }
      }
      return out;
    });

    if (!created.length) {
      throw new BadRequestException('No unsettled revenue available to request.');
    }

    // P2-221 (run #163): the response total is a Postgres exact-decimal SUM
    // over the rows this request created — it never routes the per-row
    // amounts through binary floats (the old Number() reduce could drift a
    // cent on large multi-venue sums). Comma-free string → formatMoney-safe.
    const [totals] = (await this.db.execute(sql`
      SELECT coalesce(sum(amount), 0)::numeric(12,2)::text AS total
      FROM settlements
      WHERE id IN (${sql.join(
        created.map((s) => sql`${s.id}`),
        sql`, `,
      )})
    `)) as unknown as Array<{ total: string }>;
    const totalAmount = totals?.total ?? ZERO_MONEY;

    // Audit trail: the partner actor is recorded as the settlement's origin
    // (admin actions carry `settlement.generate`; this is the request leg).
    // Outside the tx — audit failures must not roll back a committed request.
    if (this.audit) {
      await this.audit.log({
        adminId: ownerId,
        action: 'settlement.payout_requested',
        entityType: 'settlement',
        entityId: created[0].id,
        before: undefined,
        after: { requested: created.length, totalAmount, venueIds: created.map((s) => s.venueId) },
      });
    }
    // PostHog/Pino ride the standard interceptors; the audit trail + live HQ
    // refresh are the important side effects here. broadcastOps('settlements')
    // so an open HQ Settlements page updates without a manual reload.
    this.realtime.broadcastOps('settlements');

    // Partner email lane (run #165, P2-214 expansion): receipt email to the
    // partner for the payout THEY just requested. Fire-and-forget AFTER the
    // committed write + audit + ops broadcast — a mail failure never fails
    // the request (same best-effort semantics as pay()'s push, P1-67).
    // Suppression (no verified email / muted / ghost) resolves inside the
    // mailer; without transport keys it logs-and-skips (log-only mode).
    if (this.mailer) {
      this.mailer
        .sendToUsers([ownerId], 'payout_requested', {}, {})
        .catch((err: unknown) =>
          reportFanOutError('partner.payout-request-email', err),
        );
    }

    return {
      requested: created.length,
      totalAmount,
      settlements: created,
    };
  }

  async getVenues(ownerId: string, actorRole?: string) {
    // Admins inspecting the partner portal see ALL venues (support/moderation);
    // owners see only their own.
    const rows = await this.db
      .select({
        id: venues.id,
        name: venues.name,
        city: venues.city,
        address: venues.address,
        amenities: venues.amenities,
        is_approved: venues.is_approved,
        is_koralink_partner: venues.is_koralink_partner,
        owner_id: venues.owner_id,
        owner_name: sql<string>`COALESCE(${users.full_name}, '')`,
        pitch_count: sql<number>`(select count(*)::int from ${pitches} p where p.venue_id = ${venues.id})`,
        // P1-25: hours + closed days for the partner venues edit form.
        open_hour: venues.open_hour,
        close_hour: venues.close_hour,
        // P1-38 (run #170): photo paths for the admin/partner form grid.
        images: venues.images,
        closed_day_0: venues.closed_day_0,
        closed_day_1: venues.closed_day_1,
        closed_day_2: venues.closed_day_2,
        closed_day_3: venues.closed_day_3,
        closed_day_4: venues.closed_day_4,
        closed_day_5: venues.closed_day_5,
        closed_day_6: venues.closed_day_6,
      })
      .from(venues)
      .leftJoin(users, eq(users.id, venues.owner_id))
      .where(actorRole === 'Admin' ? sql`true` : eq(venues.owner_id, ownerId))
      .orderBy(venues.created_at);
    return rows;
  }

  /** Owner-created venue — starts unapproved (admin approval queue).
   * P2-5 contract (run #39): returns the FULL inserted row (every venues
   * column) instead of the sparse {id,name,city} projection — the admin
   * partner-venues row type (PartnerVenueRow) is the full column set, and a
   * mutation must return a complete entity per API Contract Rule §2. */
  async createVenue(ownerId: string, dto: CreateVenueDto) {
    const [created] = await this.db
      .insert(venues)
      .values({
        owner_id: ownerId,
        name: dto.name,
        city: dto.city,
        address: dto.address,
        is_approved: false,
      })
      .returning();

    this.realtime.broadcastOps('venues');

    return created;
  }

  /**
   * Update venue profile. Owners may edit their own venues; Admins may edit
   * any venue (support workflows). Only ever touches profile fields —
   * approval status stays under the admin decision endpoint.
   */
  async updateVenue(actorId: string, actorRole: string, venueId: string, dto: UpdateVenuePartnerDto) {
    const [venue] = await this.db
      .select({
        id: venues.id,
        owner_id: venues.owner_id,
        open_hour: venues.open_hour,
        close_hour: venues.close_hour,
      })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!venue) throw new NotFoundException('Venue not found.');

    if (actorRole !== 'Admin' && venue.owner_id !== actorId) {
      throw new ForbiddenException('You can only edit your own venues.');
    }

    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.city !== undefined) updates.city = dto.city;
    if (dto.address !== undefined) updates.address = dto.address;
    if (dto.amenities !== undefined) updates.amenities = dto.amenities;
    // P1-38 (run #170): reorder/remove photos. Paths arrive from the form grid
    // (canonical /media/venues/... strings minted by POST /media/venues);
    // shape + cap validated in the DTO, deduped here.
    // PR-Agent r2 (run #170) tenant-isolation: every incoming path MUST live
    // under THIS venue's own prefix — a partner cannot graft another venue's
    // photo paths onto theirs (nor alias another venue's photos).
    if (dto.images !== undefined) {
      // PR-Agent r3 MINOR (run #170): `images: null` passed @IsOptional() and
      // would silently CLEAR all photos — require a real array here.
      if (!Array.isArray(dto.images)) {
        throw new BadRequestException('images must be an array of photo paths.');
      }
      const ownPrefix = `/media/venues/${venueId}/`;
      const foreign = dto.images.find((p) => !p.startsWith(ownPrefix));
      if (foreign) {
        throw new BadRequestException('Image path does not belong to this venue.');
      }
      updates.images = [...new Set(dto.images)];
    }
    // P1-25 operating hours (partial update semantics, validated in the DTO;
    // cross-field rule enforced here: close must be after open, 24 = midnight allowed).
    if (dto.open_hour !== undefined || dto.close_hour !== undefined) {
      const openHour = dto.open_hour ?? Number(venue.open_hour ?? 8);
      const closeHour = dto.close_hour ?? Number(venue.close_hour ?? 23);
      if (closeHour <= openHour) {
        throw new BadRequestException('close_hour must be after open_hour.');
      }
      // Set the MERGED pair, not the raw dto — a partial update (only one of
      // the two sent) must not write an undefined key over the resolved value.
      updates.open_hour = openHour;
      updates.close_hour = closeHour;
    }
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      const key = `closed_day_${day}` as keyof UpdateVenuePartnerDto;
      const value = dto[key];
      if (value !== undefined) updates[`closed_day_${day}`] = value;
    }

    if (Object.keys(updates).length) {
      // P2-118: scope the write itself to the owner (Admins edit any venue)
      // so an ownership change after the pre-check can't land a cross-tenant write.
      const updatedRows = await this.db
        .update(venues)
        .set(withTimestamp(updates) as never)
        .where(
          actorRole === 'Admin'
            ? eq(venues.id, venueId)
            : and(eq(venues.id, venueId), eq(venues.owner_id, actorId)),
        )
        .returning({ id: venues.id });
      // Ownership lost mid-flight reads as a clean 404, not a silent no-op.
      if (!updatedRows.length) throw new NotFoundException('Venue not found.');
    }

    const [updated] = await this.db
      .select({
        id: venues.id,
        name: venues.name,
        city: venues.city,
        address: venues.address,
        amenities: venues.amenities,
        is_approved: venues.is_approved,
        owner_id: venues.owner_id,
        open_hour: venues.open_hour,
        close_hour: venues.close_hour,
        images: venues.images,
        closed_day_0: venues.closed_day_0,
        closed_day_1: venues.closed_day_1,
        closed_day_2: venues.closed_day_2,
        closed_day_3: venues.closed_day_3,
        closed_day_4: venues.closed_day_4,
        closed_day_5: venues.closed_day_5,
        closed_day_6: venues.closed_day_6,
      })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    // Venue deleted (or moved out from under the actor) mid-flight.
    if (!updated) throw new NotFoundException('Venue not found.');

    this.realtime.broadcastOps('venues');

    return updated;
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(ownerId: string, actorRole?: string) {
    // P2-216 (run #163): "today" is the Riyadh calendar day, computed in JS —
    // bare CURRENT_DATE follows the Postgres server's timezone and drifts the
    // whole dashboard across 21:00-24:00 UTC (and on any non-Riyadh server).
    const todayRiyadh = riyadhDateString();
    const owned = await this.db
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(actorRole === 'Admin' ? sql`true` : eq(venues.owner_id, ownerId));

    const venueIds = owned.map((v) => v.id);
    if (!venueIds.length) {
      return {
        venueNames: [],
        todayUtilization: 0,
        upcomingMatches: 0,
        revenueToday: 0,
        nextMatchInMinutes: null,
        scheduleToday: [],
        recentDeposits: [],
      };
    }

    const pitchIds = await this.scopedPitchIds(ownerId, actorRole);

    const [util] = await this.db
      .select({
        booked: sql<number>`count(*) filter (where ${pitch_slots.is_booked})::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(pitch_slots)
      .where(
        and(
          inArray(pitch_slots.pitch_id, pitchIds),
          eq(pitch_slots.slot_date, sql`${todayRiyadh}::date`),
        ),
      );

    const [upcoming] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(matches)
      .where(
        and(
          inArray(matches.pitch_id, pitchIds),
          UPCOMING_STATUSES,
          sql`${matches.scheduled_at} >= now()`,
        ),
      );

    const [revenue] = await this.db
      .select({
        total: sql<string>`coalesce(sum(${matches.pitch_cost_sar}), 0)::text`,
      })
      .from(matches)
      .where(
        and(
          inArray(matches.pitch_id, pitchIds),
          // P2-209 (run #163): Riyadh-day axis — both bounds are timestamptz
          // via the repo's `(date::timestamp AT TIME ZONE 'Asia/Riyadh')`
          // idiom (a timestamp-vs-timestamptz compare would silently fall
          // back to the SESSION timezone — the exact drift this removes).
          sql`${matches.scheduled_at} >= (${todayRiyadh}::date::timestamp AT TIME ZONE 'Asia/Riyadh')
            AND ${matches.scheduled_at} < (${addDaysToDateString(todayRiyadh, 1)}::date::timestamp AT TIME ZONE 'Asia/Riyadh')`,
        ),
      );

    const [next] = await this.db
      .select({
        mins: sql<number | null>`extract(epoch from (min(${matches.scheduled_at}) - now())) / 60.0`,
      })
      .from(matches)
      .where(
        and(
          inArray(matches.pitch_id, pitchIds),
          UPCOMING_STATUSES,
          sql`${matches.scheduled_at} >= now()`,
        ),
      );

    const scheduleToday = await this.db
      .select({
        pitchName: pitches.name,
        startTime: pitch_slots.start_time,
        endTime: pitch_slots.end_time,
        isBooked: pitch_slots.is_booked,
        matchTitle: matches.title,
      })
      .from(pitch_slots)
      .leftJoin(pitches, eq(pitch_slots.pitch_id, pitches.id))
      .leftJoin(matches, eq(pitch_slots.booked_match_id, matches.id))
      .where(
        and(
          inArray(pitch_slots.pitch_id, pitchIds),
          eq(pitch_slots.slot_date, sql`${todayRiyadh}::date`),
        ),
      )
      .orderBy(pitch_slots.start_time);

    const recentDeposits = await this.db
      .select({
        id: settlements.id,
        amount: settlements.amount,
        status: settlements.status,
        created_at: settlements.created_at,
        venueName: venues.name,
      })
      .from(settlements)
      .innerJoin(venues, eq(settlements.venue_id, venues.id))
      .where(inArray(settlements.venue_id, venueIds))
      .orderBy(desc(settlements.created_at))
      .limit(5);

    // ── Slice 6: upcoming list + 7-day trend (server-aggregated) ─────────
    const upcomingList = await this.db
      .select({
        id: matches.id,
        title: matches.title,
        scheduledAt: matches.scheduled_at,
        maxPlayers: matches.max_players,
        pitchName: pitches.name,
        playersFilled: sql<number>`(select count(*)::int from match_players mp where mp.match_id = ${matches.id})`,
      })
      .from(matches)
      .innerJoin(pitches, eq(matches.pitch_id, pitches.id))
      .where(
        and(inArray(matches.pitch_id, pitchIds), UPCOMING_STATUSES, gte(matches.scheduled_at, sql`now()`)),
      )
      .orderBy(matches.scheduled_at)
      .limit(5);

    // P2-109: one Riyadh-calendar axis drives both the SQL windows and the
    // JS buckets, so they can never disagree about which day is "today".
    const trendDays = riyadhTrendDays();
    const trendStart = trendDays[0];
    const trendEnd = trendDays[trendDays.length - 1];

    const weekSlots = await this.db
      .select({
        date: pitch_slots.slot_date,
        booked: sql<number>`count(*) filter (where ${pitch_slots.is_booked})::int`,
      })
      .from(pitch_slots)
      .where(
        and(
          inArray(pitch_slots.pitch_id, pitchIds),
          gte(pitch_slots.slot_date, sql`${trendStart}::date`),
          lte(pitch_slots.slot_date, sql`${trendEnd}::date`),
        ),
      )
      .groupBy(pitch_slots.slot_date);

    const weekRevenue = (await this.db.execute(sql`
      SELECT
        to_char(${matches.scheduled_at} AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') AS date,
        COALESCE(SUM(${matches.pitch_cost_sar}), 0)::text AS revenue
      FROM ${matches}
      WHERE ${inArray(matches.pitch_id, pitchIds)}
        AND ${matches.scheduled_at} >= (${trendStart}::date::timestamp AT TIME ZONE 'Asia/Riyadh')
        AND ${matches.scheduled_at} < ((${trendEnd}::date + 1)::timestamp AT TIME ZONE 'Asia/Riyadh')
      GROUP BY 1
    `)) as unknown as Array<{ date: string; revenue: string }>;

    // Fill all 7 Riyadh days so the chart never has holes.
    const slotByDay = new Map<string, number>(weekSlots.map((r) => [String(r.date), Number(r.booked)]));
    const revByDay = new Map<string, number>(weekRevenue.map((r) => [r.date, Number(r.revenue)]));
    const weeklyTrend: { date: string; bookedSlots: number; revenue: number }[] = [];
    for (const key of trendDays) {
      weeklyTrend.push({
        date: key,
        bookedSlots: slotByDay.get(key) ?? 0,
        revenue: revByDay.get(key) ?? 0,
      });
    }

    return {
      venueNames: owned.map((v) => v.name),
      venueCount: owned.length,
      pitchCount: pitchIds.length,
      todayUtilization: util.total > 0 ? util.booked / util.total : 0,
      upcomingMatches: upcoming.c ?? 0,
      revenueToday: revenue.total ?? 0,
      nextMatchInMinutes: next.mins != null ? Math.round(Number(next.mins)) : null,
      scheduleToday,
      recentDeposits,
      upcomingList,
      weeklyTrend,
    };
  }

  // ── Pitches ───────────────────────────────────────────────────────────────

  private pitchColumns = {
    id: pitches.id,
    name: pitches.name,
    size: pitches.size,
    surface_type: pitches.surface_type,
    environment: pitches.environment,
    hourly_rate: pitches.hourly_rate,
    is_active: pitches.is_active,
    images: pitches.images,
    venue_id: pitches.venue_id,
    venue_name: venues.name,
  };

  /**
   * P2-12/run-85: the single pitch write-scope predicate. Admins address any
   * pitch by id; everyone else only pitches on venues they own RIGHT NOW, so
   * a scoped write re-checks ownership at statement time instead of trusting
   * the assertPitchAccess pre-check.
   */
  private pitchOwnerScope(actorId: string, actorRole: string, pitchId: string): SQL {
    if (actorRole === 'Admin') return eq(pitches.id, pitchId);
    return and(
      eq(pitches.id, pitchId),
      sql`${pitches.venue_id} IN (SELECT id FROM venues WHERE owner_id = ${actorId})`,
    ) as SQL;
  }

  /**
   * P2-12/run-85: the single slot write-scope predicate (deleteSlot). Same
   * contract as pitchOwnerScope: Admins address any slot; everyone else only
   * slots whose pitch sits on a venue they own RIGHT NOW.
   */
  private slotOwnerScope(actorId: string, actorRole: string, slotId: string): SQL {
    if (actorRole === 'Admin') return eq(pitch_slots.id, slotId);
    return and(
      eq(pitch_slots.id, slotId),
      sql`${pitch_slots.pitch_id} IN (SELECT p.id FROM pitches p JOIN venues v ON v.id = p.venue_id WHERE v.owner_id = ${actorId})`,
    ) as SQL;
  }

  async getPitches(ownerId: string, actorRole?: string) {
    return this.db
      .select(this.pitchColumns)
      .from(pitches)
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .where(actorRole === 'Admin' ? sql`true` : eq(venues.owner_id, ownerId))
      .orderBy(venues.name, pitches.created_at);
  }

  private async findOnePitch(id: string) {
    const [pitch] = await this.db
      .select(this.pitchColumns)
      .from(pitches)
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .where(eq(pitches.id, id))
      .limit(1);
    if (!pitch) throw new NotFoundException('Pitch not found.');
    return pitch;
  }

  async createPitch(ownerId: string, dto: CreatePitchDto) {
    const [venue] = await this.db
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.id, dto.venue_id), eq(venues.owner_id, ownerId)))
      .limit(1);
    if (!venue) throw new ForbiddenException('You can only add pitches to your own venues.');

    const [created] = await this.db
      .insert(pitches)
      .values({
        venue_id: dto.venue_id,
        name: dto.name,
        size: dto.size,
        surface_type: dto.surface_type,
        environment: dto.environment,
        hourly_rate: String(dto.hourly_rate),
      })
      .returning({ id: pitches.id });

    this.realtime.broadcastOps('venues');

    return this.findOnePitch(created.id);
  }

  async updatePitch(actorId: string, actorRole: string, pitchId: string, dto: UpdatePitchDto) {
    await this.assertPitchAccess(actorId, actorRole, pitchId);

    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.size !== undefined) updates.size = dto.size;
    if (dto.surface_type !== undefined) updates.surface_type = dto.surface_type;
    if (dto.environment !== undefined) updates.environment = dto.environment;
    if (dto.hourly_rate !== undefined) updates.hourly_rate = String(dto.hourly_rate);
    if (dto.is_active !== undefined) updates.is_active = dto.is_active;

    if (Object.keys(updates).length) {
      // P2-118: scope the write to pitches on the actor's venues (Admins
      // edit any pitch); ownership lost mid-flight reads as a clean 404.
      const updated = await this.db
        .update(pitches)
        .set(withTimestamp(updates) as never)
        .where(this.pitchOwnerScope(actorId, actorRole, pitchId))
        .returning({ id: pitches.id });
      if (!updated.length) throw new NotFoundException('Pitch not found.');
    }

    this.realtime.broadcastOps('venues');

    return this.findOnePitch(pitchId);
  }

  /**
   * Delete a pitch. BLOCKED when any match has ever been played on it —
   * the FK cascades pitch → matches, which would erase match history,
   * rosters, and wallet ledger references. Pitches with history must be
   * deactivated (is_active=false) instead.
   *
   * P2-120: the tx lock + DELETE re-apply the venue-owner scope for
   * non-Admins, so ownership transferred after the pre-check reads as a
   * clean 404 instead of deleting on a stale authorization.
   */
  async deletePitch(actorId: string, actorRole: string, pitchId: string) {
    await this.assertPitchAccess(actorId, actorRole, pitchId);

    const scope = this.pitchOwnerScope(actorId, actorRole, pitchId);

    // One tx + FOR UPDATE on the pitch row: matches.pitch_id is ON DELETE
    // CASCADE, so without the lock a match inserted between the history count
    // and the DELETE would be silently cascade-erased. The row lock makes any
    // concurrent FK-referencing insert block until this tx commits.
    await this.db.transaction(async (tx) => {
      const [pitch] = await tx
        .select({ id: pitches.id })
        .from(pitches)
        .where(scope)
        .limit(1)
        .for('update');

      if (!pitch) throw new NotFoundException('Pitch not found.');

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.matches)
        .where(eq(schema.matches.pitch_id, pitchId));

      if (count > 0) {
        throw new BadRequestException(
          `This pitch has ${count} match(es) in its history and cannot be deleted — set it unavailable instead.`,
        );
      }

      // Belt-and-braces (PR-Agent MINOR, run #83): under READ COMMITTED the
      // DELETE gets its own snapshot, so an ownership transfer committing
      // between the locked SELECT and this DELETE would match 0 rows —
      // observe the affected-row count instead of claiming {deleted: true}.
      const deleted = await tx
        .delete(pitches)
        .where(scope)
        .returning({ id: pitches.id });
      if (!deleted.length) throw new NotFoundException('Pitch not found.');
    });

    this.realtime.broadcastOps('venues');

    return { deleted: true };
  }

  // ── Earnings ──────────────────────────────────────────────────────────────

  async getEarnings(ownerId: string, actorRole?: string) {
    // P1-65: one Riyadh-calendar axis drives the SQL window AND the JS buckets.
    const trendWeeks = riyadhTrendWeeks();
    const windowStart = trendWeeks[0];
    const windowEnd = addDaysToDateString(windowStart, EARNINGS_TREND_WEEKS * 7 - 1);

    const venueIds = await this.scopedVenueIds(ownerId, actorRole);
    if (!venueIds.length) {
      return {
        settlements: [],
        totalPending: ZERO_MONEY,
        totalPaid: ZERO_MONEY,
        perVenue: [] as EarningsVenueRevenue[],
        fourWeekTrend: zeroTrendWeeks(trendWeeks),
        utilizationPct: 0,
      };
    }

    // P2-209 residue (run #163): the console totals are a Postgres exact
    // decimal SUM — the old JS reduce routed every amount through Number()
    // floats before display (P2-4 violation). One aggregate query, zero row
    // fetches; empty scopes / zero rows return the '0.00' string contract.
    const [totals] = (await this.db.execute(sql`
      SELECT
        coalesce(sum(amount) filter (where status = 'pending'), 0)::numeric(12,2)::text AS pending,
        coalesce(sum(amount) filter (where status = 'paid'), 0)::numeric(12,2)::text AS paid
      FROM settlements
      WHERE venue_id IN (${sql.join(
        venueIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `)) as unknown as Array<{ pending: string; paid: string }>;
    const totalPending = totals?.pending ?? ZERO_MONEY;
    const totalPaid = totals?.paid ?? ZERO_MONEY;

    const rows = await this.db
      .select({
        id: settlements.id,
        amount: settlements.amount,
        status: settlements.status,
        period_start: settlements.period_start,
        period_end: settlements.period_end,
        payout_ref: settlements.payout_ref,
        paid_at: settlements.paid_at,
        created_at: settlements.created_at,
        venue_name: venues.name,
        // P2-C (run #143): payout-request provenance — WHO asked for this
        // settlement (NULL = auto-generated by the admin generator).
        requested_by: settlements.requested_by,
        requested_by_name: users.full_name,
      })
      .from(settlements)
      .innerJoin(venues, eq(settlements.venue_id, venues.id))
      // LEFT JOIN: legacy/auto rows have no requester; partner-requested rows
      // resolve the human name for the console read-model.
      .leftJoin(users, eq(settlements.requested_by, users.id))
      .where(inArray(settlements.venue_id, venueIds))
      .orderBy(desc(settlements.created_at));

    const pitchIds = await this.scopedPitchIds(ownerId, actorRole);
    const revenue = await this.getEarningsRevenue(venueIds, pitchIds, trendWeeks, windowStart, windowEnd);

    return { settlements: rows, totalPending, totalPaid, ...revenue };
  }

  /**
   * P1-65: partner revenue read-model over the 4-week Riyadh window — all
   * aggregation happens in SQL; money is SUM(matches.pitch_cost_sar)::text,
   * counts are ints. Cancelled matches never count as booked revenue.
   */
  private async getEarningsRevenue(
    venueIds: string[],
    pitchIds: string[],
    trendWeeks: string[],
    windowStart: string,
    windowEnd: string,
  ): Promise<{ perVenue: EarningsVenueRevenue[]; fourWeekTrend: EarningsTrendWeek[]; utilizationPct: number }> {
    const inWindow = sql`${matches.scheduled_at} >= (${windowStart}::date::timestamp AT TIME ZONE 'Asia/Riyadh')
        AND ${matches.scheduled_at} < ((${windowEnd}::date + 1)::timestamp AT TIME ZONE 'Asia/Riyadh')
        AND ${matches.status} <> 'Cancelled'`;

    const perVenueRows = (await this.db.execute(sql`
      SELECT
        ${venues.id} AS "venueId",
        ${venues.name} AS "venueName",
        COUNT(${matches.id})::int AS "bookedCount",
        COALESCE(SUM(${matches.pitch_cost_sar}), 0)::numeric(12,2)::text AS revenue
      FROM ${venues}
      LEFT JOIN ${pitches} ON ${pitches.venue_id} = ${venues.id}
      LEFT JOIN ${matches} ON ${matches.pitch_id} = ${pitches.id} AND ${inWindow}
      WHERE ${inArray(venues.id, venueIds)}
      GROUP BY ${venues.id}, ${venues.name}
      ORDER BY COALESCE(SUM(${matches.pitch_cost_sar}), 0) DESC, ${venues.name} ASC
    `)) as unknown as EarningsVenueRevenue[];

    if (!pitchIds.length) {
      return {
        perVenue: perVenueRows.map(normalizeVenueRevenue),
        fourWeekTrend: zeroTrendWeeks(trendWeeks),
        utilizationPct: 0,
      };
    }

    const weekRows = (await this.db.execute(sql`
      SELECT
        ((${matches.scheduled_at} AT TIME ZONE 'Asia/Riyadh')::date - ${windowStart}::date) / 7 AS "weekIndex",
        COUNT(${matches.id})::int AS "bookedCount",
        COALESCE(SUM(${matches.pitch_cost_sar}), 0)::numeric(12,2)::text AS revenue
      FROM ${matches}
      WHERE ${inArray(matches.pitch_id, pitchIds)}
        AND ${inWindow}
      GROUP BY 1
    `)) as unknown as Array<{ weekIndex: number | string; bookedCount: number | string; revenue: string }>;

    const [slotRow] = (await this.db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        (COUNT(*) FILTER (WHERE ${pitch_slots.is_booked}))::int AS booked
      FROM ${pitch_slots}
      WHERE ${inArray(pitch_slots.pitch_id, pitchIds)}
        AND ${pitch_slots.slot_date} >= ${windowStart}::date
        AND ${pitch_slots.slot_date} <= ${windowEnd}::date
    `)) as unknown as Array<{ total: number | string; booked: number | string }>;

    // Fill all 4 weeks so the chart never has holes.
    const byWeek = new Map(weekRows.map((r) => [Number(r.weekIndex), r]));
    const fourWeekTrend = trendWeeks.map((weekStart, i) => {
      const r = byWeek.get(i);
      return {
        weekStart,
        revenue: r ? String(r.revenue) : ZERO_MONEY,
        bookedCount: r ? Number(r.bookedCount) : 0,
      };
    });

    const total = Number(slotRow?.total ?? 0);
    const booked = Number(slotRow?.booked ?? 0);
    const utilizationPct = total > 0 ? Math.round((booked / total) * 1000) / 10 : 0;

    return { perVenue: perVenueRows.map(normalizeVenueRevenue), fourWeekTrend, utilizationPct };
  }

  // ── Verification (business profile) ───────────────────────────────────────

  async getVerification(ownerId: string) {
    const rows = await this.db
      .select({
        venue_id: venues.id,
        venue_name: venues.name,
        verification: venue_verifications,
      })
      .from(venues)
      .leftJoin(venue_verifications, eq(venue_verifications.venue_id, venues.id))
      .where(eq(venues.owner_id, ownerId));

    return rows.map((r) => ({ venue_id: r.venue_id, venue_name: r.venue_name, verification: r.verification }));
  }

  /**
   * P2-12/run-85: the ownership check and the upsert share one tx, and the
   * venue row is locked FOR UPDATE — ownership cannot transfer between the
   * check and the write, so a stale authorization can never upsert payout
   * details (IBAN) onto someone else's venue.
   */
  async submitVerification(ownerId: string, dto: SubmitVerificationDto) {
    await this.db.transaction(async (tx) => {
      const [venue] = await tx
        .select({ id: venues.id, owner_id: venues.owner_id })
        .from(venues)
        .where(eq(venues.id, dto.venue_id))
        .limit(1)
        .for('update');
      if (!venue) {
        // Deliberate contract (independent review, run #85): a MISSING venue
        // reads as non-owned — 403 with the same message, so venue ids cannot
        // be probed through this endpoint. (The 404 convention applies to
        // pitch/slot writes where a scoped SELECT already hides the row.)
        throw new ForbiddenException('You can only verify your own venues.');
      }
      if (venue.owner_id !== ownerId) {
        throw new ForbiddenException('You can only verify your own venues.');
      }

      await tx
        .insert(venue_verifications)
        .values({
          venue_id: dto.venue_id,
          legal_entity_name: dto.legal_entity_name,
          commercial_reg: dto.commercial_reg ?? null,
          tax_id: dto.tax_id ?? null,
          iban: dto.iban ?? null,
          manager_name: dto.manager_name ?? null,
          manager_phone: dto.manager_phone ?? null,
          status: 'pending',
        })
        .onConflictDoUpdate({
          target: venue_verifications.venue_id,
          set: {
            legal_entity_name: dto.legal_entity_name,
            commercial_reg: dto.commercial_reg ?? null,
            tax_id: dto.tax_id ?? null,
            iban: dto.iban ?? null,
            manager_name: dto.manager_name ?? null,
            manager_phone: dto.manager_phone ?? null,
            status: 'pending',
            submitted_at: new Date(),
          },
        });
    });

    return this.getVerification(ownerId);
  }

  // ── Slot management ───────────────────────────────────────────────────────

  /** Assert the actor owns the pitch (Admin bypasses for support). */
  private async assertPitchAccess(actorId: string, actorRole: string, pitchId: string) {
    const [row] = await this.db
      .select({ id: pitches.id, owner_id: venues.owner_id })
      .from(pitches)
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .where(eq(pitches.id, pitchId))
      .limit(1);
    if (!row) throw new NotFoundException('Pitch not found.');
    if (actorRole !== 'Admin' && row.owner_id !== actorId) {
      throw new ForbiddenException('You can only manage slots on your own pitches.');
    }
    return row;
  }

  /**
   * List a pitch's slots in a date window (inclusive). Includes booking state
   * + the booked match title so the schedule grid shows what occupies a slot.
   */
  async listSlots(
    actorId: string,
    actorRole: string,
    pitchId: string,
    fromDate: string,
    toDate: string,
  ) {
    await this.assertPitchAccess(actorId, actorRole, pitchId);

    const rows = await this.db
      .select({
        id: pitch_slots.id,
        slot_date: pitch_slots.slot_date,
        start_time: pitch_slots.start_time,
        end_time: pitch_slots.end_time,
        is_booked: pitch_slots.is_booked,
        match_title: matches.title,
        match_id: matches.id,
      })
      .from(pitch_slots)
      .leftJoin(matches, eq(pitch_slots.booked_match_id, matches.id))
      .where(
        and(
          eq(pitch_slots.pitch_id, pitchId),
          gte(pitch_slots.slot_date, fromDate),
          lte(pitch_slots.slot_date, toDate),
        ),
      )
      .orderBy(pitch_slots.slot_date, pitch_slots.start_time);

    return { slots: rows };
  }

  /**
   * Generate recurring slots from a weekly pattern. Ownership enforced —
   * previously ANY authenticated user could slot-bomb any pitch.
   */
  async generateSlots(
    actorId: string,
    actorRole: string,
    pitchId: string,
    pattern: GenerateSlotsDto,
  ) {
    await this.assertPitchAccess(actorId, actorRole, pitchId);

    const { created, skipped } = await this.db.transaction(async (tx) => {
      // P2-12/run-85: re-check ownership inside the tx. FOR UPDATE over the
      // pitch ⋈ venue join locks BOTH rows, so neither the pitch's venue nor
      // the venue's owner can change until the INSERT commits; a transfer
      // that committed after the pre-check reads as a clean 404.
      const [locked] = await tx
        .select({ id: pitches.id })
        .from(pitches)
        .innerJoin(venues, eq(pitches.venue_id, venues.id))
        .where(this.pitchOwnerScope(actorId, actorRole, pitchId))
        .limit(1)
        .for('update');
      if (!locked) throw new NotFoundException('Pitch not found.');

      // P1-25: clamp slot generation to the venue's operating hours. Riyadh-local
      // by product convention (slots are wall-clock strings on slot_date).
      const [venueRow] = await tx
        .select({
          open_hour: venues.open_hour,
          close_hour: venues.close_hour,
          closed_day_0: venues.closed_day_0,
          closed_day_1: venues.closed_day_1,
          closed_day_2: venues.closed_day_2,
          closed_day_3: venues.closed_day_3,
          closed_day_4: venues.closed_day_4,
          closed_day_5: venues.closed_day_5,
          closed_day_6: venues.closed_day_6,
        })
        .from(pitches)
        .innerJoin(venues, eq(pitches.venue_id, venues.id))
        .where(eq(pitches.id, pitchId))
        .limit(1);
      const openMins = Number(venueRow?.open_hour ?? 0) * 60;
      const closeMins = Number(venueRow?.close_hour ?? 24) * 60;

      const rows: Array<{
        pitch_id: string;
        slot_date: string;
        start_time: string;
        end_time: string;
      }> = [];

      const [sh, sm] = pattern.start_time.split(':').map(Number);
      const [eh, em] = pattern.end_time.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      if (endMins <= startMins) {
        throw new BadRequestException('end_time must be after start_time.');
      }
      const dur = pattern.slot_duration_mins;

      // P1-25: requested capacity before hours-clamping (for skipped accounting).
      const totalCapacity =
        pattern.weeks_ahead *
        pattern.days_of_week.reduce(
          (sum, _dow) => sum + windowCapacity(startMins, endMins, dur),
          0,
        );

      const closedDay = (dow: number) =>
        Boolean(venueRow?.[`closed_day_${dow}` as keyof typeof venueRow]);

      // P2-109: "today" and weekdays are Riyadh-local via the UTC-midnight
      // convention (same as createSlot) — never server-local getDay/setDate.
      const today = riyadhDateString();
      const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay();
      for (let w = 0; w < pattern.weeks_ahead; w++) {
        for (const dow of pattern.days_of_week) {
          // P1-25: whole-day closure → nothing bookable on this weekday.
          if (closedDay(dow)) continue;

          const dayDiff = (dow - todayDow + 7) % 7;
          const dateStr = addDaysToDateString(today, dayDiff + w * 7);

          // P1-25: intersect the requested window with the venue's hours for
          // that day — slots never spill outside opening time.
          const from = Math.max(startMins, openMins);
          const to = Math.min(endMins, closeMins);

          for (let m = from; m + dur <= to; m += dur) {
            const hh = String(Math.floor(m / 60)).padStart(2, '0');
            const mm = String(m % 60).padStart(2, '0');
            const ehh = String(Math.floor((m + dur) / 60)).padStart(2, '0');
            const emm = String((m + dur) % 60).padStart(2, '0');
            rows.push({
              pitch_id: pitchId,
              slot_date: dateStr,
              start_time: `${hh}:${mm}:00`,
              end_time: `${ehh}:${emm}:00`,
            });
          }
        }
      }

      // Set-based upsert: one round-trip, conflicts skipped atomically.
      let created = 0;
      let skipped = 0;
      if (rows.length) {
        const inserted = await tx
          .insert(pitch_slots)
          .values(rows)
          .onConflictDoNothing({
            target: [pitch_slots.pitch_id, pitch_slots.slot_date, pitch_slots.start_time],
          })
          .returning({ id: pitch_slots.id });
        created = inserted.length;
        skipped = rows.length - created;
      }
      // P1-25: report hour-clamped / closed-day slots as skipped so the partner
      // sees why fewer slots appeared than the pattern requested.
      skipped += totalCapacity - rows.length;

      return { created, skipped };
    });

    this.realtime.broadcastOps('venues');

    return { created, skipped };
  }

  /** Create one specific slot (odd days, one-off sessions). */
  async createSlot(actorId: string, actorRole: string, pitchId: string, dto: CreateSlotDto) {
    await this.assertPitchAccess(actorId, actorRole, pitchId);

    if (dto.end_time <= dto.start_time) {
      throw new BadRequestException('end_time must be after start_time.');
    }

    const slot = await this.db.transaction(async (tx) => {
      // P2-12/run-85: re-check ownership inside the tx. FOR UPDATE over the
      // pitch ⋈ venue join locks BOTH rows, so neither the pitch's venue nor
      // the venue's owner can change until the INSERT commits; a transfer
      // that committed after the pre-check reads as a clean 404.
      const [locked] = await tx
        .select({ id: pitches.id })
        .from(pitches)
        .innerJoin(venues, eq(pitches.venue_id, venues.id))
        .where(this.pitchOwnerScope(actorId, actorRole, pitchId))
        .limit(1)
        .for('update');
      if (!locked) throw new NotFoundException('Pitch not found.');

      // P1-25: one-off slots must sit inside the venue's operating hours on an
      // open day (slot dates/times are Riyadh-local wall clock by convention;
      // the calendar weekday of the date string is exact via UTC midnight).
      const [venueHours] = await tx
        .select({
          open_hour: venues.open_hour,
          close_hour: venues.close_hour,
          closed_day_0: venues.closed_day_0,
          closed_day_1: venues.closed_day_1,
          closed_day_2: venues.closed_day_2,
          closed_day_3: venues.closed_day_3,
          closed_day_4: venues.closed_day_4,
          closed_day_5: venues.closed_day_5,
          closed_day_6: venues.closed_day_6,
        })
        .from(pitches)
        .innerJoin(venues, eq(pitches.venue_id, venues.id))
        .where(eq(pitches.id, pitchId))
        .limit(1);
      if (venueHours) {
        const dow = new Date(`${dto.slot_date}T00:00:00Z`).getUTCDay();
        if (venueHours[`closed_day_${dow}` as keyof typeof venueHours]) {
          throw new BadRequestException('The venue is closed on that day.');
        }
        const toMins = (t: string) => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };
        const openMins = Number(venueHours.open_hour) * 60;
        const closeMins = Number(venueHours.close_hour) * 60;
        if (toMins(dto.start_time) < openMins || toMins(dto.end_time) > closeMins) {
          throw new BadRequestException(
            `Slot must sit inside venue opening hours (${venueHours.open_hour}:00–${venueHours.close_hour}:00).`,
          );
        }
      }

      // P2-249 (run #160, Reviewer A #159): inspect the error code — the old
      // blind catch misdiagnosed ANY tx failure (deadlock, serialization,
      // connection drop) as "slot already exists". Only a 23505 on the
      // (pitch_id, slot_date, start_time) unique constraint is a conflict;
      // postgres-js surfaces driver codes on err.cause as well as err (same
      // dual-surface read as completeProfile, P2-238).
      try {
        const [slot] = await tx
          .insert(pitch_slots)
          .values({
            pitch_id: pitchId,
            slot_date: dto.slot_date,
            start_time: `${dto.start_time}:00`,
            end_time: `${dto.end_time}:00`,
          })
          .returning();
        // Leaf table (no relations to join) — the bare returning row IS the
        // fully populated shape for this endpoint (P2-249: standardized
        // deliberately, not an accidental bare-row return).
        return slot;
      } catch (err) {
        const pgCode =
          (err as { code?: string })?.code ??
          (err as { cause?: { code?: string } })?.cause?.code;
        if (pgCode !== '23505') throw err;
        throw new ConflictException('A slot already exists at that date and time.');
      }
    });

    this.realtime.broadcastOps('venues');
    return slot;
  }

  /**
   * Delete an unbooked slot. Booked slots must be cancelled via the match.
   *
   * P2-12/run-85: the locked select + DELETE re-apply the venue-owner scope
   * for non-Admins (mirrors deletePitch), so ownership transferred after the
   * assertPitchAccess pre-check reads as a clean 404 instead of deleting on a
   * stale authorization.
   */
  async deleteSlot(actorId: string, actorRole: string, slotId: string) {
    const [slot] = await this.db
      .select({ id: pitch_slots.id, pitch_id: pitch_slots.pitch_id, is_booked: pitch_slots.is_booked })
      .from(pitch_slots)
      .where(eq(pitch_slots.id, slotId))
      .limit(1);
    if (!slot) throw new NotFoundException('Slot not found.');

    await this.assertPitchAccess(actorId, actorRole, slot.pitch_id);

    if (slot.is_booked) {
      throw new BadRequestException(
        'This slot is booked by a match — cancel the match first to release it.',
      );
    }

    const scope = this.slotOwnerScope(actorId, actorRole, slotId);

    await this.db.transaction(async (tx) => {
      // FOR UPDATE on the slot row: a booking flips is_booked via UPDATE, so it
      // blocks until this tx commits instead of racing the DELETE.
      const [locked] = await tx
        .select({ id: pitch_slots.id, is_booked: pitch_slots.is_booked })
        .from(pitch_slots)
        .where(scope)
        .limit(1)
        .for('update');
      if (!locked) throw new NotFoundException('Slot not found.');
      if (locked.is_booked) {
        throw new ConflictException(
          'This slot was just booked by a match — cancel the match first to release it.',
        );
      }

      // Conditional DELETE (P1-18): `is_booked = false` stays in the predicate
      // so a booked slot can never be deleted here (booked slots are released
      // via match cancellation only). Under READ COMMITTED the DELETE takes a
      // fresh snapshot, so observe the affected-row count rather than assume.
      const deleted = await tx
        .delete(pitch_slots)
        .where(and(scope, eq(pitch_slots.is_booked, false)))
        .returning({ id: pitch_slots.id });

      if (deleted.length === 0) {
        // Distinguish the two ways to match zero rows: still visible in scope
        // and booked → 409; otherwise ownership moved mid-flight → 404.
        const [current] = await tx
          .select({ is_booked: pitch_slots.is_booked })
          .from(pitch_slots)
          .where(scope)
          .limit(1);
        if (current?.is_booked) {
          throw new ConflictException(
            'This slot was just booked by a match — cancel the match first to release it.',
          );
        }
        throw new NotFoundException('Slot not found.');
      }
    });

    this.realtime.broadcastOps('venues');

    return { deleted: true };
  }

  /**
   * P2-246 (run #161): bulk slot blackout — delete every FREE slot of one
   * pitch in an inclusive date range (venue maintenance, Ramadan closure).
   * "Closed" = row deleted, the same semantics as the single-slot deleteSlot;
   * booked slots are NEVER touched (reported as skippedBooked) — releasing a
   * booked slot stays the match-cancellation flow's job. Re-generating the
   * window afterwards recreates the slots (generateSlots).
   *
   * Guard parity with generateSlots: pitch access pre-check, then an in-tx
   * FOR UPDATE lock over the pitch ⋈ venue join so an ownership transfer
   * committing mid-flight reads as a clean 404. The DELETE itself carries
   * `is_booked = false` in its predicate (P1-18 pattern) so a booking that
   * lands between the count and the delete can never remove a sold slot —
   * the closedInstances count is read from the DELETE's own returning rows.
   */
  async blackoutSlots(
    actorId: string,
    actorRole: string,
    pitchId: string,
    dto: BlackoutSlotsDto,
  ) {
    await this.assertPitchAccess(actorId, actorRole, pitchId);

    const result = await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: pitches.id })
        .from(pitches)
        .innerJoin(venues, eq(pitches.venue_id, venues.id))
        .where(this.pitchOwnerScope(actorId, actorRole, pitchId))
        .limit(1)
        .for('update');
      if (!locked) throw new NotFoundException('Pitch not found.');

      const range = and(
        eq(pitch_slots.pitch_id, pitchId),
        gte(pitch_slots.slot_date, dto.from),
        lte(pitch_slots.slot_date, dto.to),
      );

      const deleted = await tx
        .delete(pitch_slots)
        .where(and(range, eq(pitch_slots.is_booked, false)))
        .returning({ id: pitch_slots.id });

      const [bookedRow] = await tx
        .select({ booked: sql<number>`count(*)::int` })
        .from(pitch_slots)
        .where(and(range, eq(pitch_slots.is_booked, true)));

      return { closed: deleted.length, skippedBooked: bookedRow?.booked ?? 0 };
    });

    this.realtime.broadcastOps('venues');

    return {
      pitchId,
      from: dto.from,
      to: dto.to,
      closedInstances: result.closed,
      skippedBooked: result.skippedBooked,
    };
  }

  // ── Match visibility (P1-26) ────────────────────────────────────────────────

  /**
   * Matches on the actor's pitches — the partner's ops view. Scoping mirrors
   * getDashboard/getEarnings: owners see their venues' pitches, Admins see all
   * (support/moderation). Default statuses differ by scope (P1-34): "today" is
   * the Riyadh-local recap and includes cancelled/completed (ops surface, not a
   * feed); "upcoming" is forward-looking and excludes Cancelled by default —
   * dead matches listed as upcoming are noise. `?status=` narrows either scope.
   */
  async getPartnerMatches(
    ownerId: string,
    actorRole: string | undefined,
    q: {
      scope: 'today' | 'upcoming';
      status?: string;
      venueId?: string;
      pitchId?: string;
      sortBy?: string;
      dir?: 'asc' | 'desc';
      limit: number;
      offset: number;
    },
  ) {
    const pitchIds = await this.scopedPitchIds(ownerId, actorRole);
    if (!pitchIds.length) {
      return { matches: [], total: 0, hasMore: false };
    }

    // P2-32 (run #27, owner decision 2026-09-02): an explicit ?pitchId that
    // is not in the caller's scope is a 404, not a silent fall-through to
    // the venue/no filter. The pre-fix behaviour returned 200 + an empty
    // list — indistinguishable from "no matches" — which made partner
    // misconfigurations look like network glitches. Distinguishes 404
    // "not in your scope" from the existing `assertPitchAccess` 403/404
    // pair: getPartnerMatches is a read-only listing, so the missing-pitch
    // path is purely a "not visible to you" answer, not a permission error.
    if (q.pitchId && !pitchIds.includes(q.pitchId)) {
      throw new NotFoundException('Pitch not in your scope.');
    }

    const timeScope =
      q.scope === 'upcoming'
        ? sql`${matches.scheduled_at} >= now()`
        : sql`(${matches.scheduled_at} AT TIME ZONE 'Asia/Riyadh')::date = (now() AT TIME ZONE 'Asia/Riyadh')::date`;

    const statusFilter =
      q.status && q.status.length
        ? sql`${matches.status} = ${q.status}`
        : q.scope === 'upcoming'
          ? // P1-34: forward-looking view lists playable matches only — an
            // explicit ?status= (incl. 'Cancelled') still wins above.
            sql`${matches.status} <> ${'Cancelled'}`
          : sql`true`;

    // P2-30: additive venue/pitch narrowing (venueId implies its pitches;
    // explicit pitchId wins). Never short-circuits the scope/status predicates.
    const scopeFilter =
      q.pitchId && pitchIds.includes(q.pitchId)
        ? sql`${matches.pitch_id} = ${q.pitchId}`
        : q.venueId
          ? sql`${pitches.venue_id} = ${q.venueId}`
          : sql`true`;

    const rows = await this.db
      .select({
        id: matches.id,
        title: matches.title,
        status: matches.status,
        scheduled_at: matches.scheduled_at,
        duration_mins: matches.duration_mins,
        booking_mode: matches.booking_mode,
        spots_filled: sql<number>`count(${match_players.id})::int`,
        max_players: matches.max_players,
        no_show_count: sql<number>`count(${match_players.id}) filter (where ${match_players.no_show})::int`,
        pitch_id: matches.pitch_id,
        pitch_name: pitches.name,
        venue_id: venues.id,
        venue_name: venues.name,
        host_name: users.full_name,
        total: sql<number>`count(*) over ()::int`,
      })
      .from(matches)
      .innerJoin(pitches, eq(matches.pitch_id, pitches.id))
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .innerJoin(users, eq(matches.host_id, users.id))
      .leftJoin(match_players, eq(match_players.match_id, matches.id))
      .where(and(inArray(matches.pitch_id, pitchIds), timeScope, statusFilter, scopeFilter))
      .groupBy(
        matches.id,
        pitches.name,
        venues.id,
        venues.name,
        users.full_name,
      )
      .orderBy(
        ...(q.sortBy === 'scheduled_at'
          ? [q.dir === 'desc' ? desc(matches.scheduled_at) : asc(matches.scheduled_at)]
          : [matches.scheduled_at]),
      )
      .limit(q.limit)
      .offset(q.offset);

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    return {
      matches: rows.map(({ total: _t, ...m }) => m),
      total,
      hasMore: q.offset + rows.length < total,
    };
  }

  /** One scoped match with its full roster (names, phones, teams, no-shows). */
  async getPartnerMatch(actorId: string, actorRole: string, matchId: string) {
    const [match] = await this.db
      .select({
        id: matches.id,
        pitch_id: matches.pitch_id,
        title: matches.title,
        status: matches.status,
        visibility: matches.visibility,
        scheduled_at: matches.scheduled_at,
        duration_mins: matches.duration_mins,
        booking_mode: matches.booking_mode,
        spots_filled: sql<number>`(select count(*)::int from ${match_players} mp where mp.match_id = ${matches.id})`,
        max_players: matches.max_players,
        no_show_count: sql<number>`(select count(*)::int from ${match_players} mp where mp.match_id = ${matches.id} and mp.no_show)`,
        pitch_name: pitches.name,
        venue_id: venues.id,
        venue_name: venues.name,
        host_name: users.full_name,
      })
      .from(matches)
      .innerJoin(pitches, eq(matches.pitch_id, pitches.id))
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .innerJoin(users, eq(matches.host_id, users.id))
      .where(eq(matches.id, matchId))
      .limit(1);
    if (!match) throw new NotFoundException('Match not found.');

    // Same access rule as pitch mutations: owner or Admin.
    await this.assertPitchAccess(actorId, actorRole, match.pitch_id);

    const players = await this.db
      .select({
        user_id: match_players.user_id,
        full_name: users.full_name,
        phone: sql<string>`${users.phone}::text`,
        team: match_players.team,
        is_host: match_players.is_host,
        no_show: match_players.no_show,
      })
      .from(match_players)
      .innerJoin(users, eq(match_players.user_id, users.id))
      .where(eq(match_players.match_id, matchId))
      .orderBy(desc(match_players.is_host), users.full_name);

    const { pitch_id: _pid, ...detail } = match;
    return { ...detail, players };
  }
}
