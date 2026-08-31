import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SQL, and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { pitches } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListPitchesDto } from './dto/list-pitches.dto';
import { UpdatePitchAdminDto } from './dto/update-pitch-admin.dto';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { PartnerService } from '../partner/partner.service';
import { CreateSlotDto, GenerateSlotsDto } from '../partner/dto/slots.dto';

type DB = PostgresJsDatabase<typeof schema>;

/**
 * HQ-level pitch management. Pitches inherit ownership from their venue
 * (venues.owner_id), so "who owns this pitch" resolves through the venue
 * and moving a pitch to another venue moves its effective ownership.
 */
@Injectable()
export class AdminPitchesService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly partner: PartnerService,
  ) {}

  async list(dto: ListPitchesDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const search = dto.search?.trim();

    // NOTE: the WHERE keyword lives here — `and(...)` produces bare clauses.
    const clauses: SQL[] = [];
    if (search) {
      clauses.push(
        sql`(p.name ILIKE ${'%' + search + '%'} OR v.name ILIKE ${'%' + search + '%'} OR u.full_name ILIKE ${'%' + search + '%'} OR u.phone ILIKE ${'%' + search + '%'})`,
      );
    }
    if (dto.venueId) {
      clauses.push(sql`v.id::text = ${dto.venueId}`);
    }
    const where: SQL = clauses.length
      ? sql`WHERE ${and(...clauses)!}`
      : sql``;

    const rows = (await this.db.execute(sql`
      SELECT
        p.id, p.name, p.size, p.surface_type, p.environment,
        p.hourly_rate::float AS hourly_rate, p.is_active, p.created_at,
        v.id AS venue_id, v.name AS venue_name, v.city AS venue_city,
        u.id AS owner_id, u.full_name AS owner_name, u.phone AS owner_phone,
        (SELECT COUNT(*)::int FROM pitch_slots ps
           WHERE ps.pitch_id = p.id AND ps.slot_date >= CURRENT_DATE) AS slots_total,
        (SELECT COUNT(*)::int FROM pitch_slots ps
           WHERE ps.pitch_id = p.id AND ps.slot_date >= CURRENT_DATE AND ps.is_booked) AS slots_booked
      FROM pitches p
      INNER JOIN venues v ON v.id = p.venue_id
      LEFT JOIN users u ON u.id = v.owner_id
      ${where}
      ORDER BY v.name ASC, p.name ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c
      FROM pitches p
      INNER JOIN venues v ON v.id = p.venue_id
      LEFT JOIN users u ON u.id = v.owner_id
      ${where}
    `)) as unknown as Array<{ c: number }>;

    return { pitches: rows, total: countRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    const rows = (await this.db.execute(sql`
      SELECT
        p.id, p.name, p.size, p.surface_type, p.environment,
        p.hourly_rate::float AS hourly_rate, p.is_active, p.created_at,
        v.id AS venue_id, v.name AS venue_name, v.city AS venue_city,
        u.id AS owner_id, u.full_name AS owner_name, u.phone AS owner_phone
      FROM pitches p
      INNER JOIN venues v ON v.id = p.venue_id
      LEFT JOIN users u ON u.id = v.owner_id
      WHERE p.id::text = ${id}
      LIMIT 1
    `)) as unknown as Array<Record<string, unknown>>;

    if (!rows.length) {
      throw new NotFoundException('Pitch not found.');
    }
    return rows[0];
  }

  async update(id: string, dto: UpdatePitchAdminDto, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    if (
      dto.name === undefined &&
      dto.size === undefined &&
      dto.surface_type === undefined &&
      dto.environment === undefined &&
      dto.hourly_rate === undefined &&
      dto.is_active === undefined &&
      dto.venue_id === undefined
    ) {
      throw new BadRequestException('No changes provided.');
    }

    if (dto.venue_id !== undefined) {
      const [venue] = await this.db
        .select({ id: schema.venues.id })
        .from(schema.venues)
        .where(eq(schema.venues.id, dto.venue_id))
        .limit(1);
      if (!venue) throw new NotFoundException('Target venue not found.');
    }

    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.size !== undefined) updates.size = dto.size;
    if (dto.surface_type !== undefined) updates.surface_type = dto.surface_type;
    if (dto.environment !== undefined) updates.environment = dto.environment;
    if (dto.hourly_rate !== undefined) updates.hourly_rate = String(dto.hourly_rate);
    if (dto.is_active !== undefined) updates.is_active = dto.is_active;
    if (dto.venue_id !== undefined) updates.venue_id = dto.venue_id;

    await this.db
      .update(pitches)
      .set(withTimestamp(updates) as never)
      .where(eq(pitches.id, id));

    const after = await this.findOne(id);

    await this.audit.log({
      adminId,
      action: 'pitch.update',
      entityType: 'pitch',
      entityId: id,
      before,
      after,
      ip,
    });
    this.realtime.broadcastOps('venues');

    return after;
  }

  // ── Schedule management (admin acts on user/partner feedback) ─────────
  // Delegates to PartnerService with actorRole='Admin' — the same slot
  // logic the partner uses, admin-bypassed ownership, plus the audit trail.

  async listSlots(id: string, from: string, to: string) {
    await this.findOne(id); // 404 guard
    return this.partner.listSlots('', 'Admin', id, from, to);
  }

  async generateSlots(id: string, dto: GenerateSlotsDto, adminId: string, ip?: string) {
    const result = await this.partner.generateSlots(adminId, 'Admin', id, dto);
    await this.audit.log({
      adminId,
      action: 'pitch.slots_generate',
      entityType: 'pitch',
      entityId: id,
      before: { dto },
      after: result,
      ip,
    });
    return result;
  }

  async createSlot(id: string, dto: CreateSlotDto, adminId: string, ip?: string) {
    const result = await this.partner.createSlot(adminId, 'Admin', id, dto);
    await this.audit.log({
      adminId,
      action: 'pitch.slot_create',
      entityType: 'pitch',
      entityId: id,
      before: { dto },
      after: result,
      ip,
    });
    return result;
  }

  async deleteSlot(slotId: string, adminId: string, ip?: string) {
    const result = await this.partner.deleteSlot(adminId, 'Admin', slotId);
    await this.audit.log({
      adminId,
      action: 'pitch.slot_delete',
      entityType: 'slot',
      entityId: slotId,
      before: { slotId },
      after: result,
      ip,
    });
    return result;
  }
}
