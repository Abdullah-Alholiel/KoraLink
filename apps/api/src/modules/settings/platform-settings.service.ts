import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { app_settings } from '../../database/schema';

type DB = PostgresJsDatabase<typeof schema>;

/**
 * Read-only, cached access to the `app_settings` table for business logic.
 *
 * Admin edits land through `AdminSettingsService`; this service is the read
 * path used by the pricing engine, the no-show grace window, and the
 * settlement cadence. A short in-memory TTL avoids a DB round-trip per
 * request while keeping edits visible within seconds.
 */
@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private cache: Record<string, unknown> = {};
  private loadedAt = 0;
  private readonly TTL_MS = 30_000;

  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  async getNumber(key: string, fallback: number): Promise<number> {
    const value = await this.get(key);
    if (value === undefined || value === null) return fallback;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  async getString(key: string, fallback: string): Promise<string> {
    const value = await this.get(key);
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  }

  private async get(key: string): Promise<unknown> {
    if (Date.now() - this.loadedAt > this.TTL_MS) {
      await this.reload();
    }
    return this.cache[key];
  }

  private async reload(): Promise<void> {
    try {
      const rows = await this.db.select().from(app_settings);
      const next: Record<string, unknown> = {};
      for (const row of rows) next[row.key] = row.value;
      this.cache = next;
      this.loadedAt = Date.now();
    } catch (err) {
      // Keep the stale cache on failure — better than crashing a request.
      this.logger.warn(`Failed to reload platform settings: ${(err as Error).message}`);
    }
  }
}
