import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
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
import { CreatePitchDto } from './dto/create-pitch.dto';
import { UpdatePitchDto } from './dto/update-pitch.dto';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateSlotDto, GenerateSlotsDto, UpdateVenuePartnerDto } from './dto/slots.dto';
import { RealtimeService } from '../gateway/realtime.service';

type DB = PostgresJsDatabase<typeof schema>;

const UPCOMING_STATUSES = sql`${matches.status} IN ('Open', 'Full', 'InProgress')`;

@Injectable()
export class PartnerService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly realtime: RealtimeService,
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
        owner_name: users.full_name,
        pitch_count: sql<number>`(select count(*)::int from ${pitches} p where p.venue_id = ${venues.id})`,
      })
      .from(venues)
      .innerJoin(users, eq(users.id, venues.owner_id))
      .where(actorRole === 'Admin' ? sql`true` : eq(venues.owner_id, ownerId))
      .orderBy(venues.created_at);
    return rows;
  }

  /** Owner-created venue — starts unapproved (admin approval queue). */
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
      .returning({ id: venues.id, name: venues.name, city: venues.city });

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
      .select({ id: venues.id, owner_id: venues.owner_id })
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

    if (Object.keys(updates).length) {
      await this.db
        .update(venues)
        .set(withTimestamp(updates) as never)
        .where(eq(venues.id, venueId));
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
      })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);

    this.realtime.broadcastOps('venues');

    return updated;
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(ownerId: string, actorRole?: string) {
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
        and(inArray(pitch_slots.pitch_id, pitchIds), eq(pitch_slots.slot_date, sql`CURRENT_DATE`)),
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
        total: sql<number>`coalesce(sum(${matches.pitch_cost_sar}), 0)::float`,
      })
      .from(matches)
      .where(
        and(
          inArray(matches.pitch_id, pitchIds),
          sql`date_trunc('day', ${matches.scheduled_at}) = CURRENT_DATE`,
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
        and(inArray(pitch_slots.pitch_id, pitchIds), eq(pitch_slots.slot_date, sql`CURRENT_DATE`)),
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

    return {
      venueNames: owned.map((v) => v.name),
      todayUtilization: util.total > 0 ? util.booked / util.total : 0,
      upcomingMatches: upcoming.c ?? 0,
      revenueToday: revenue.total ?? 0,
      nextMatchInMinutes: next.mins != null ? Math.round(Number(next.mins)) : null,
      scheduleToday,
      recentDeposits,
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
      await this.db
        .update(pitches)
        .set(withTimestamp(updates) as never)
        .where(eq(pitches.id, pitchId));
    }

    this.realtime.broadcastOps('venues');

    return this.findOnePitch(pitchId);
  }

  /**
   * Delete a pitch. BLOCKED when any match has ever been played on it —
   * the FK cascades pitch → matches, which would erase match history,
   * rosters, and wallet ledger references. Pitches with history must be
   * deactivated (is_active=false) instead.
   */
  async deletePitch(actorId: string, actorRole: string, pitchId: string) {
    await this.assertPitchAccess(actorId, actorRole, pitchId);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.matches)
      .where(eq(schema.matches.pitch_id, pitchId));

    if (count > 0) {
      throw new BadRequestException(
        `This pitch has ${count} match(es) in its history and cannot be deleted — set it unavailable instead.`,
      );
    }

    await this.db.delete(pitches).where(eq(pitches.id, pitchId));
    this.realtime.broadcastOps('venues');

    return { deleted: true };
  }

  // ── Earnings ──────────────────────────────────────────────────────────────

  async getEarnings(ownerId: string, actorRole?: string) {
    const venueIds = await this.scopedVenueIds(ownerId, actorRole);
    if (!venueIds.length) {
      return { settlements: [], totalPending: 0, totalPaid: 0 };
    }

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
      })
      .from(settlements)
      .innerJoin(venues, eq(settlements.venue_id, venues.id))
      .where(inArray(settlements.venue_id, venueIds))
      .orderBy(desc(settlements.created_at));

    const totalPending = rows
      .filter((r) => r.status === 'pending')
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const totalPaid = rows
      .filter((r) => r.status === 'paid')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    return { settlements: rows, totalPending, totalPaid };
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

  async submitVerification(ownerId: string, dto: SubmitVerificationDto) {
    const [venue] = await this.db
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.id, dto.venue_id), eq(venues.owner_id, ownerId)))
      .limit(1);
    if (!venue) throw new ForbiddenException('You can only verify your own venues.');

    await this.db
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

    const today = new Date();
    for (let w = 0; w < pattern.weeks_ahead; w++) {
      for (const dow of pattern.days_of_week) {
        const date = new Date(today);
        const dayDiff = (dow - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + dayDiff + w * 7);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        for (let m = startMins; m + dur <= endMins; m += dur) {
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
      const inserted = await this.db
        .insert(pitch_slots)
        .values(rows)
        .onConflictDoNothing({
          target: [pitch_slots.pitch_id, pitch_slots.slot_date, pitch_slots.start_time],
        })
        .returning({ id: pitch_slots.id });
      created = inserted.length;
      skipped = rows.length - created;
    }

    this.realtime.broadcastOps('venues');

    return { created, skipped };
  }

  /** Create one specific slot (odd days, one-off sessions). */
  async createSlot(actorId: string, actorRole: string, pitchId: string, dto: CreateSlotDto) {
    await this.assertPitchAccess(actorId, actorRole, pitchId);

    if (dto.end_time <= dto.start_time) {
      throw new BadRequestException('end_time must be after start_time.');
    }

    try {
      const [slot] = await this.db
        .insert(pitch_slots)
        .values({
          pitch_id: pitchId,
          slot_date: dto.slot_date,
          start_time: `${dto.start_time}:00`,
          end_time: `${dto.end_time}:00`,
        })
        .returning();
      this.realtime.broadcastOps('venues');
      return slot;
    } catch {
      throw new ConflictException('A slot already exists at that date and time.');
    }
  }

  /** Delete an unbooked slot. Booked slots must be cancelled via the match. */
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

    // Conditional DELETE closes the TOCTOU between the is_booked SELECT above
    // and the DELETE: a match that books the slot in between makes the
    // predicate match zero rows, so a booked slot can never be deleted here
    // (booked slots are released via match cancellation only).
    const deleted = await this.db
      .delete(pitch_slots)
      .where(and(eq(pitch_slots.id, slotId), eq(pitch_slots.is_booked, false)))
      .returning({ id: pitch_slots.id });

    if (deleted.length === 0) {
      throw new ConflictException(
        'This slot was just booked by a match — cancel the match first to release it.',
      );
    }
    this.realtime.broadcastOps('venues');

    return { deleted: true };
  }

  // ── Match visibility (P1-26) ────────────────────────────────────────────────

  /**
   * Matches on the actor's pitches — the partner's ops view. Scoping mirrors
   * getDashboard/getEarnings: owners see their venues' pitches, Admins see all
   * (support/moderation). Both scopes return ALL statuses by default (today's
   * view includes cancelled/completed — an ops surface, not a feed); `?status=`
   * narrows. "today" is the Riyadh-local calendar day (app display TZ).
   */
  async getPartnerMatches(
    ownerId: string,
    actorRole: string | undefined,
    q: { scope: 'today' | 'upcoming'; status?: string; limit: number; offset: number },
  ) {
    const pitchIds = await this.scopedPitchIds(ownerId, actorRole);
    if (!pitchIds.length) {
      return { matches: [], total: 0, hasMore: false };
    }

    const timeScope =
      q.scope === 'upcoming'
        ? sql`${matches.scheduled_at} >= now()`
        : sql`(${matches.scheduled_at} AT TIME ZONE 'Asia/Riyadh')::date = (now() AT TIME ZONE 'Asia/Riyadh')::date`;

    const statusFilter =
      q.status && q.status.length
        ? sql`${matches.status} = ${q.status}`
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
      .where(and(inArray(matches.pitch_id, pitchIds), timeScope, statusFilter))
      .groupBy(
        matches.id,
        pitches.name,
        venues.id,
        venues.name,
        users.full_name,
      )
      .orderBy(matches.scheduled_at)
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
