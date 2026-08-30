import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SQL, and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches, personal_messages, reports, users, venues } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListReportsDto } from './dto/list-reports.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { AdminUsersService } from './users.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminReportsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly adminUsers: AdminUsersService,
    private readonly activities: ActivitiesService,
    private readonly notifications: NotificationsService,
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
        COALESCE(u.full_name, u.handle, m.title, v.name, 'Message from ' || COALESCE(su.full_name, su.handle, 'unknown user')) AS subject_label
      FROM reports r
      LEFT JOIN users rep ON rep.id = r.reporter_id
      LEFT JOIN users u ON u.id = r.subject_id AND r.subject_type = 'user'
      LEFT JOIN matches m ON m.id = r.subject_id AND r.subject_type = 'match'
      LEFT JOIN venues v ON v.id = r.subject_id AND r.subject_type = 'venue'
      LEFT JOIN personal_messages pm ON r.subject_type = 'message' AND pm.id = r.subject_id
      LEFT JOIN users su ON su.id = pm.sender_id
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

    // P2-23 (run #17): reporter closure — in-app activity (feed + bell) and a
    // web-push that honors the reporter's delivery preferences (P1-20/P2-27).
    // Best-effort: a notification failure must never fail the resolution.
    try {
      await this.activities.record({
        actorId: adminId,
        verb: 'report_resolved',
        recipients: [before.reporter.id],
        excludeActor: false,
      });
      await this.notifications.sendPushToUsers([before.reporter.id], {
        title: 'Report update',
        body:
          dto.outcome === 'resolved'
            ? 'Your report was resolved. Thank you for helping keep KoraLink safe.'
            : 'Your report was reviewed and dismissed.',
        data: { type: 'report-resolved' },
      });
    } catch {
      // best-effort — resolution already committed and audited
    }

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

    if (type === 'message') {
      // P1-31: admin sees sender + a content snippet (admin console only —
      // the player-facing mine-list never exposes message content).
      const [pm] = await this.db
        .select({ id: personal_messages.id, content: personal_messages.content, sender_id: personal_messages.sender_id })
        .from(personal_messages)
        .where(eq(personal_messages.id, id))
        .limit(1);
      if (!pm) return { type, id, label: id, status: 'missing' };
      const [sender] = await this.db
        .select({ full_name: users.full_name, handle: users.handle })
        .from(users)
        .where(eq(users.id, pm.sender_id))
        .limit(1);
      const senderName = sender?.full_name ?? sender?.handle ?? 'unknown user';
      const snippet = pm.content.length > 60 ? `${pm.content.slice(0, 60)}…` : pm.content;
      return { type, id, label: `Message from ${senderName} · "${snippet}"`, status: 'sent' };
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
