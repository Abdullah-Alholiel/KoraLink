import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SQL, and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { disputes, dispute_messages } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';
import { ListDisputesDto } from './dto/list-disputes.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { AuditService } from './audit.service';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminDisputesService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListDisputesDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 20;
    const where: SQL | undefined = dto.status
      ? sql`WHERE d.status = ${dto.status}`
      : undefined;

    const rows = (await this.db.execute(sql`
      SELECT
        d.id, d.type, d.status, d.decision, d.policy_ref, d.created_at, d.updated_at,
        r.full_name AS reporter_name, resp.full_name AS respondent_name,
        m.id AS match_id, m.title AS match_title
      FROM disputes d
      LEFT JOIN users r ON r.id = d.reporter_id
      LEFT JOIN users resp ON resp.id = d.respondent_id
      LEFT JOIN matches m ON m.id = d.match_id
      ${where}
      ORDER BY d.created_at DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c FROM disputes d
      ${where}
    `)) as unknown as Array<{ c: number }>;

    return { disputes: rows, total: countRows[0]?.c ?? 0, page, perPage };
  }

  async findOne(id: string) {
    const dispute = await this.db.query.disputes.findFirst({
      where: eq(disputes.id, id),
      with: {
        reporter: { columns: { id: true, full_name: true, handle: true, avatar_url: true, phone: true } },
        respondent: { columns: { id: true, full_name: true, handle: true, avatar_url: true, phone: true } },
        match: { columns: { id: true, title: true, status: true, scheduled_at: true } },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found.');
    }

    const messages = await this.db.query.dispute_messages.findMany({
      where: eq(dispute_messages.dispute_id, id),
      with: { author: { columns: { id: true, full_name: true, avatar_url: true } } },
      orderBy: (t, { asc }) => [asc(t.created_at)],
    });

    return { ...dispute, messages };
  }

  async resolve(id: string, dto: ResolveDisputeDto, adminId: string, ip?: string) {
    const before = await this.findOne(id);

    await this.db
      .update(disputes)
      .set(
        withTimestamp({
          status: dto.outcome,
          decision: dto.decision ?? null,
          internal_note: dto.internalNote ?? null,
          decided_by: adminId,
        }),
      )
      .where(eq(disputes.id, id));

    const after = await this.findOne(id);
    await this.audit.log({
      adminId,
      action: 'dispute.resolve',
      entityType: 'dispute',
      entityId: id,
      before,
      after,
      ip,
    });

    return after;
  }
}
