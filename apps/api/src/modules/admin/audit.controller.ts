import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { SQL, and, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { ListAuditDto } from './dto/list-audit.dto';

type DB = PostgresJsDatabase<typeof schema>;

@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard)
export class AdminAuditController {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  @Get()
  async list(@Query() dto: ListAuditDto) {
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 50;
    const conds: SQL[] = [];
    if (dto.adminId) conds.push(sql`a.admin_id = ${dto.adminId}`);
    if (dto.entityType) conds.push(sql`a.entity_type = ${dto.entityType}`);
    const where = conds.length ? sql`WHERE ${and(...conds)}` : sql``;

    const rows = (await this.db.execute(sql`
      SELECT
        a.id, a.admin_id, a.action, a.entity_type, a.entity_id,
        a.before, a.after, a.ip, a.created_at,
        u.full_name AS admin_name
      FROM audit_logs a
      INNER JOIN users u ON u.id = a.admin_id
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
