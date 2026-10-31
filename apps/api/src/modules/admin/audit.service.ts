import { Injectable, Inject } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { audit_logs } from '../../database/schema';

type DB = PostgresJsDatabase<typeof schema>;

export interface AuditEntry {
  adminId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/**
 * Append-only admin audit trail. Every admin mutation MUST call `log()` so
 * "who did what, when" is reconstructable (enterprise/V﻿C requirement).
 */
@Injectable()
export class AuditService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  /**
   * Append one audit entry. Pass a drizzle transaction as `executor` to make
   * the audit entry commit (or roll back) WITH the caller's mutation —
   * P2-141: the report-ban path requires this so "report resolved" and
   * "subject banned" + both audit entries are one atomic unit. Default
   * (no executor) keeps the old standalone-write behavior for callers
   * outside any tx.
   */
  async log(entry: AuditEntry, executor?: Pick<DB, 'insert'>): Promise<void> {
    await (executor ?? this.db).insert(audit_logs).values({
      admin_id: entry.adminId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      ip: entry.ip ?? null,
    });
  }
}
