import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { matches, personal_messages, reports, users, venues } from '../../database/schema';
import { CreateReportDto, ReportSubjectType } from './dto/create-report.dto';
import { ListMyReportsDto } from './dto/list-my-reports.dto';

type DB = PostgresJsDatabase<typeof schema>;

/** Second join over `users` for message reports (the message sender). */
const message_sender = alias(users, 'message_sender');

@Injectable()
export class ReportsService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  async create(reporterId: string, dto: CreateReportDto) {
    if (dto.subjectType === 'user' && dto.subjectId === reporterId) {
      throw new BadRequestException('You cannot report yourself.');
    }
    // P1-31: a player cannot report their OWN chat message — the subject of a
    // message report must be someone else's message.
    if (dto.subjectType === 'message') {
      const [msg] = await this.db
        .select({ sender_id: personal_messages.sender_id })
        .from(personal_messages)
        .where(eq(personal_messages.id, dto.subjectId))
        .limit(1);
      if (msg && msg.sender_id === reporterId) {
        throw new BadRequestException('You cannot report your own message.');
      }
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
  /**
   * P2-31(2) (run #23): reporter-closure mine-list with server-side paging.
   * Envelope `{ reports, total, hasMore }` (the P1-19 pattern) — `total` rides
   * `COUNT(*) OVER()` (window count taken BEFORE LIMIT — no second query);
   * `hasMore = offset + rows.length < total`.
   */
  async listMine(reporterId: string, query?: ListMyReportsDto) {
    const limit = Math.min(Math.max(query?.limit ?? 50, 1), 50);
    const offset = Math.max(query?.offset ?? 0, 0);

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
        message_sender_name: message_sender.full_name,
        total: sql<number>`COUNT(*) OVER ()`.mapWith(Number),
      })
      .from(reports)
      .leftJoin(users, and(eq(reports.subject_type, 'user'), eq(users.id, reports.subject_id)))
      .leftJoin(matches, and(eq(reports.subject_type, 'match'), eq(matches.id, reports.subject_id)))
      .leftJoin(venues, and(eq(reports.subject_type, 'venue'), eq(venues.id, reports.subject_id)))
      // P1-31: message reports resolve to the SENDER's name — never the raw
      // message id, and message content stays admin-only.
      .leftJoin(
        personal_messages,
        and(eq(reports.subject_type, 'message'), eq(personal_messages.id, reports.subject_id)),
      )
      .leftJoin(
        message_sender,
        and(
          eq(reports.subject_type, 'message'),
          eq(message_sender.id, personal_messages.sender_id),
        ),
      )
      .where(eq(reports.reporter_id, reporterId))
      .orderBy(desc(reports.created_at))
      .limit(limit)
      .offset(offset);

    const total = rows.length > 0 ? rows[0].total : 0;

    return {
      reports: rows.map((r) => ({
        id: r.id,
        subject_type: r.subject_type,
        subject_id: r.subject_id,
        subject_label:
          r.user_name ??
          r.match_title ??
          r.venue_name ??
          (r.message_sender_name != null
            ? `Message from ${r.message_sender_name}`
            : r.subject_id),
        reason: r.reason,
        status: r.status,
        resolution: r.resolution,
        resolved_at: r.resolved_at,
        created_at: r.created_at,
      })),
      total,
      hasMore: offset + rows.length < total,
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
    if (type === 'message') {
      const [row] = await this.db
        .select({ id: personal_messages.id })
        .from(personal_messages)
        .where(eq(personal_messages.id, id))
        .limit(1);
      if (!row) throw new NotFoundException('Message not found.');
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
