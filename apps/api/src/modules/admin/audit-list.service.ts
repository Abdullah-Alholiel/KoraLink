import { Injectable, Inject } from '@nestjs/common';
import { SQL, and, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { escapeLikePattern } from '../../common/utils/escape-like';
import { ListAuditDto } from './dto/list-audit.dto';

type DB = PostgresJsDatabase<typeof schema>;

/**
 * P2-292 (Reviewer A run #181 I-2, lifted run #186): the audit list used to
 * live inline in AdminAuditController — the only admin controller doing its own
 * persistence. Persistence now sits behind the same controller→service seam as
 * every other admin module; the controller stays thin.
 *
 * Named AdminAuditListService to stay distinct from `AuditService`
 * (audit.service.ts — the append-only WRITE trail every admin mutation calls).
 *
 * P2-292 rider (Reviewer A run #186 I-3): the list joined `users` via INNER
 * JOIN, so audit rows whose admin was hard-purged (PDPL erase) silently
 * vanished from the immutable trail. The join is now LEFT — purged actors
 * render with admin_name = null (the admin console already renders "—").
 */
@Injectable()
export class AdminAuditListService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  async list(dto: ListAuditDto): Promise<{
    logs: Array<Record<string, unknown>>;
    total: number;
    page: number;
    perPage: number;
  }> {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 50;
    const conds: SQL[] = [];
    if (dto.adminId) conds.push(sql`a.admin_id = ${dto.adminId}`);
    if (dto.entityType) conds.push(sql`a.entity_type = ${dto.entityType}`);
    // Escape LIKE wildcards so a literal search term (e.g. "50%") matches itself.
    if (dto.action) {
      const pattern = '%' + escapeLikePattern(dto.action) + '%';
      conds.push(sql`a.action ILIKE ${pattern} ESCAPE '\\'`);
    }
    const where = conds.length ? sql`WHERE ${and(...conds)}` : sql``;

    const rows = (await this.db.execute(sql`
      SELECT
        a.id, a.admin_id, a.action, a.entity_type, a.entity_id,
        a.before, a.after, a.ip, a.created_at,
        u.full_name AS admin_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.admin_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const countRows = (await this.db.execute(sql`
      SELECT COUNT(*)::int AS c FROM audit_logs a ${where}
    `)) as unknown as Array<{ c: number }>;

    return { logs: rows, total: countRows[0]?.c ?? 0, page, perPage };
  }
}
