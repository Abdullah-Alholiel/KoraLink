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

  async log(entry: AuditEntry): Promise<void> {
    await this.db.insert(audit_logs).values({
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
