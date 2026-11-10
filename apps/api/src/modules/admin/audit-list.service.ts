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
    // P2-335 (Reviewer B run #198): date-range filter for incident forensics.
    // from is inclusive; to is treated as "on/before that DAY" — implemented
    // as `< to::date + 1 day` so the boundary timestamp's time-of-day never
    // silently drops same-day rows. Day bounds are pinned to UTC explicitly
    // (r1 MINOR: ::date casts interpret in the session TimeZone — the app's
    // display timezone is Asia/Riyadh but the audit day convention is UTC,
    // matching the CSV timestamp export). Casts stay ::date/::text-safe
    // (house rule: never ::uuid).
    if (dto.from) conds.push(sql`a.created_at >= (${dto.from}::date)::timestamp AT TIME ZONE 'UTC'`);
    if (dto.to) conds.push(sql`a.created_at < (((${dto.to}::date + INTERVAL '1 day'))::timestamp AT TIME ZONE 'UTC')`);
    const where = conds.length ? sql`WHERE ${and(...conds)}` : sql``;

    // P2-318 (Reviewer A run #193): pagination contract —
    // `COUNT(*) OVER()` (window count taken BEFORE LIMIT) rides the page
    // query and the unique `a.id DESC` tiebreaker: bulk admin actions stamp
    // identical ms timestamps, so created_at-only ordering
    // duplicated/straddled rows across pages.
    const rows = (await this.db.execute(sql`
      SELECT
        a.id, a.admin_id, a.action, a.entity_type, a.entity_id,
        a.before, a.after, a.ip, a.created_at,
        u.full_name AS admin_name,
        COUNT(*) OVER()::int AS total_count
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.admin_id
      ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `)) as unknown as Array<Record<string, unknown>>;

    const logs = rows.map(({ total_count: _tc, ...rest }) => rest);
    let total =
      typeof (rows[0] as { total_count?: unknown } | undefined)
        ?.total_count === 'number'
        ? (rows[0] as { total_count: number }).total_count
        : 0;

    // PR-Agent r1 (P2-318 round 2, run #193): the window count rides ROW 0 —
    // an EMPTY page (beyond-range fetch, or a last page concurrently
    // emptied) has no row to carry it and would report total 0, telling the
    // console there are no logs at all and collapsing pagination. The
    // legacy exact COUNT returns ONLY for this case; every populated page
    // stays single-query.
    if (rows.length === 0) {
      const countRows = (await this.db.execute(
        sql`SELECT COUNT(*)::int AS c FROM audit_logs a ${where}`
      )) as unknown as Array<{ c: number }>;
      total = countRows[0]?.c ?? 0;
    }

    return { logs, total, page, perPage };
  }
}
