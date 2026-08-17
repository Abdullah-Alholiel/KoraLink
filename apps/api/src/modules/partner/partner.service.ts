import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import {
  matches,
  pitch_slots,
  pitches,
  settlements,
  venue_verifications,
  venues,
} from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { CreatePitchDto } from './dto/create-pitch.dto';
import { UpdatePitchDto } from './dto/update-pitch.dto';
import { SubmitVerificationDto } from './dto/submit-verification.dto';

type DB = PostgresJsDatabase<typeof schema>;

const UPCOMING_STATUSES = sql`${matches.status} IN ('Open', 'Full', 'InProgress')`;

@Injectable()
export class PartnerService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  private async ownedVenueIds(ownerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.owner_id, ownerId));
    return rows.map((r) => r.id);
  }

  private async ownedPitchIds(ownerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: pitches.id })
      .from(pitches)
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .where(eq(venues.owner_id, ownerId));
    return rows.map((r) => r.id);
  }

  async getVenues(ownerId: string) {
    return this.db
      .select({ id: venues.id, name: venues.name, city: venues.city })
      .from(venues)
      .where(eq(venues.owner_id, ownerId))
      .orderBy(venues.created_at);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(ownerId: string) {
    const owned = await this.db
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(eq(venues.owner_id, ownerId));

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

    const pitchIds = await this.ownedPitchIds(ownerId);

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

  async getPitches(ownerId: string) {
    return this.db
      .select(this.pitchColumns)
      .from(pitches)
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .where(eq(venues.owner_id, ownerId))
      .orderBy(pitches.created_at);
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

    return this.findOnePitch(created.id);
  }

  async updatePitch(ownerId: string, pitchId: string, dto: UpdatePitchDto) {
    const [pitch] = await this.db
      .select({ id: pitches.id })
      .from(pitches)
      .innerJoin(venues, eq(pitches.venue_id, venues.id))
      .where(and(eq(pitches.id, pitchId), eq(venues.owner_id, ownerId)))
      .limit(1);
    if (!pitch) throw new NotFoundException('Pitch not found.');

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

    return this.findOnePitch(pitchId);
  }

  // ── Earnings ──────────────────────────────────────────────────────────────

  async getEarnings(ownerId: string) {
    const venueIds = await this.ownedVenueIds(ownerId);
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
}
