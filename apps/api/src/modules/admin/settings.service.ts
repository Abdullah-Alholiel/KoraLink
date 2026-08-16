import { Inject, Injectable } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { app_settings } from '../../database/schema';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AdminSettingsService {
  constructor(@Inject('DB_CONNECTION') private readonly db: DB) {}

  async getAll() {
    const rows = await this.db.select().from(app_settings);
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return { settings };
  }

  async set(key: string, value: unknown) {
    await this.db
      .insert(app_settings)
      .values({ key, value: value as never })
      .onConflictDoUpdate({
        target: app_settings.key,
        set: { value: value as never, updated_at: new Date() },
      });
    return { key, value };
  }
}
