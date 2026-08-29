import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches, reports, users, venues } from '../../database/schema';
import { CreateReportDto, ReportSubjectType } from './dto/create-report.dto';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class ReportsService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  async create(reporterId: string, dto: CreateReportDto) {
    if (dto.subjectType === 'user' && dto.subjectId === reporterId) {
      throw new BadRequestException('You cannot report yourself.');
    }

    await this.assertSubjectExists(dto.subjectType, dto.subjectId);

    // De-duplicate: one open/reviewing report per (reporter, subject).
    const [existing] = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporter_id, reporterId),
          eq(reports.subject_type, dto.subjectType),
          eq(reports.subject_id, dto.subjectId),
          inArray(reports.status, ['open', 'reviewing']),
        ),
      )
      .limit(1);

    if (existing) {
      throw new BadRequestException('You have already reported this subject.');
    }

    // Insert guarded by a partial unique index on
    // (reporter_id, subject_type, subject_id) WHERE status IN ('open','reviewing').
    // `onConflictDoNothing` makes the write atomic — a concurrent duplicate submit
    // returns zero rows instead of inserting a second report.
    const [report] = await this.db
      .insert(reports)
      .values({
        reporter_id: reporterId,
        subject_type: dto.subjectType,
        subject_id: dto.subjectId,
        reason: dto.reason.trim(),
        status: 'open',
      })
      .onConflictDoNothing()
      .returning();

    if (!report) {
      throw new BadRequestException('You have already reported this subject.');
    }

    return report;
  }

  /**
   * P2-23 (run #17): the reporter's own reports, newest first — closes the
   * "reporters never learn the outcome" gap. Subject labels only (no
   * contact data); resolution text only once the report is closed.
   */
  async listMine(reporterId: string) {
    const rows = await this.db
      .select({
        id: reports.id,
        subject_type: reports.subject_type,
        subject_id: reports.subject_id,
        reason: reports.reason,
        status: reports.status,
        resolution: reports.resolution,
        resolved_at: reports.resolved_at,
        created_at: reports.created_at,
        user_name: users.full_name,
        match_title: matches.title,
        venue_name: venues.name,
      })
      .from(reports)
      .leftJoin(users, and(eq(reports.subject_type, 'user'), eq(users.id, reports.subject_id)))
      .leftJoin(matches, and(eq(reports.subject_type, 'match'), eq(matches.id, reports.subject_id)))
      .leftJoin(venues, and(eq(reports.subject_type, 'venue'), eq(venues.id, reports.subject_id)))
      .where(eq(reports.reporter_id, reporterId))
      .orderBy(desc(reports.created_at))
      .limit(50);

    return {
      reports: rows.map((r) => ({
        id: r.id,
        subject_type: r.subject_type,
        subject_id: r.subject_id,
        subject_label: r.user_name ?? r.match_title ?? r.venue_name ?? r.subject_id,
        reason: r.reason,
        status: r.status,
        resolution: r.resolution,
        resolved_at: r.resolved_at,
        created_at: r.created_at,
      })),
    };
  }

  private async assertSubjectExists(type: ReportSubjectType, id: string) {
    if (type === 'user') {
      const [row] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!row) throw new NotFoundException('User not found.');
      return;
    }
    if (type === 'match') {
      const [row] = await this.db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.id, id))
        .limit(1);
      if (!row) throw new NotFoundException('Match not found.');
      return;
    }
    const [row] = await this.db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Venue not found.');
  }
}
