import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SQL, and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches, reports, users, venues } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListReportsDto } from './dto/list-reports.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { AdminUsersService } from './users.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminReportsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly adminUsers: AdminUsersService,
  ) {}

  async list(dto: ListReportsDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;

    const conds: SQL[] = [];
    if (dto.status) conds.push(sql`r.status = ${dto.status}`);
    if (dto.subjectType) conds.push(sql`r.subject_type = ${dto.subjectType}`);
    const where = conds.length ? sql`WHERE ${and(...conds)}` : sql``;

    const rows = (await this.db.execute(sql`
      SELECT
        r.id, r.subject_type, r.subject_id, r.reason, r.status, r.resolution,
        r.resolved_at, r.created_at,
        rep.full_name AS reporter_name, rep.handle AS reporter_handle,
        COALESCE(u.full_name, u.handle, m.title, v.name) AS subject_label
      FROM reports r
      LEFT JOIN users rep ON rep.id = r.reporter_id
      LEFT JOIN users u ON u.id = r.subject_id AND r.subject_type = 'user'
      LEFT JOIN matches m ON m.id = r.subject_id AND r.subject_type = 'match'
      LEFT JOIN venues v ON v.id = r.subject_id AND r.subject_type = 'venue'
      ${where}
      ORDER BY
        CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END ASC,
        r.created_at DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c FROM reports r ${where}
    `)) as unknown as Array<{ c: number }>;

    return { reports: rows, total: countRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    const report = await this.db.query.reports.findFirst({
      where: eq(reports.id, id),
      with: {
        reporter: {
          columns: { id: true, full_name: true, handle: true, avatar_url: true, phone: true },
        },
        resolvedBy: { columns: { id: true, full_name: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found.');
    }

    const subject = await this.resolveSubject(report.subject_type, report.subject_id);
    return { ...report, subject };
  }

  async resolve(id: string, dto: ResolveReportDto, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    if (before.status === 'resolved' || before.status === 'dismissed') {
      throw new BadRequestException('This report has already been resolved.');
    }

    if (dto.banSubject) {
      if (before.subject_type !== 'user') {
        throw new BadRequestException('Only a user subject can be banned from a report.');
      }
      if (dto.outcome !== 'resolved') {
        throw new BadRequestException('banSubject requires outcome "resolved".');
      }
      // Reuse the full ban path (self-ban + last-admin guards, audit, realtime).
      await this.adminUsers.update(before.subject_id, { banned: true }, adminId, ip);
    }

    await this.db
      .update(reports)
      .set(
        withTimestamp({
          status: dto.outcome,
          resolution: dto.resolution ?? null,
          resolved_by: adminId,
          resolved_at: new Date(),
        }),
      )
      .where(eq(reports.id, id));

    const after = await this.findOne(id);
    await this.audit.log({
      adminId,
      action: 'report.resolve',
      entityType: 'report',
      entityId: id,
      before,
      after,
      ip,
    });
    this.realtime.broadcastOps('reports');
    if (dto.banSubject) this.realtime.broadcastOps('users');

    return after;
  }

  private async resolveSubject(type: string, id: string) {
    if (type === 'user') {
      const [u] = await this.db
        .select({
          id: users.id,
          full_name: users.full_name,
          handle: users.handle,
          phone: users.phone,
          banned_at: users.banned_at,
          suspended_until: users.suspended_until,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!u) return { type, id, label: id, status: 'missing' };
      const label = u.full_name ?? u.handle ?? u.phone ?? id;
      const status = u.banned_at
        ? 'banned'
        : u.suspended_until && new Date(u.suspended_until) > new Date()
          ? 'suspended'
          : 'active';
      return { type, id, label, status };
    }

    if (type === 'match') {
      const [m] = await this.db
        .select({ id: matches.id, title: matches.title, status: matches.status })
        .from(matches)
        .where(eq(matches.id, id))
        .limit(1);
      return { type, id, label: m?.title ?? id, status: m?.status ?? 'missing' };
    }

    const [v] = await this.db
      .select({ id: venues.id, name: venues.name, is_approved: venues.is_approved })
      .from(venues)
      .where(eq(venues.id, id))
      .limit(1);
    return {
      type,
      id,
      label: v?.name ?? id,
      status: v ? (v.is_approved ? 'approved' : 'pending') : 'missing',
    };
  }
}
