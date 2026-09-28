import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { app_settings } from '../../database/schema';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { RealtimeService } from '../gateway/realtime.service';
import { AuditService } from './audit.service';

type DB = PostgresJsDatabase<typeof schema>;

type SettingSpec =
  | { type: 'number'; min: number; max: number }
  | { type: 'text'; maxLength: number };

/**
 * The complete platform-settings key universe. Server consumers
 * (PlatformSettingsService) and the admin UI agree on exactly these keys —
 * anything else is rejected rather than silently persisted.
 */
export const KNOWN_SETTINGS = {
  platform_margin_sar: { type: 'number', min: 0, max: 1000 },
  grace_period_mins: { type: 'number', min: 0, max: 1440 },
  payout_cadence_days: { type: 'number', min: 1, max: 90 },
  refund_policy: { type: 'text', maxLength: 10000 },
} as const satisfies Record<string, SettingSpec>;

export type SettingKey = keyof typeof KNOWN_SETTINGS;

@Injectable()
export class AdminSettingsService {
  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly platformSettings: PlatformSettingsService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  async getAll() {
    const rows = await this.db.select().from(app_settings);
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return { settings };
  }

  async set(
    key: string,
    value: unknown,
    adminId: string,
    ip?: string | null,
  ): Promise<{ key: SettingKey; value: number | string }> {
    const settingKey = this.assertKnownKey(key);
    const newValue = this.validateValue(settingKey, value);

    // Read the real old value and upsert atomically — the row lock keeps a
    // concurrent edit from making the audit `before` stale.
    const oldValue = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ value: app_settings.value })
        .from(app_settings)
        .where(eq(app_settings.key, settingKey))
        .for('update');
      await tx
        .insert(app_settings)
        .values({ key: settingKey, value: newValue as never })
        .onConflictDoUpdate({
          target: app_settings.key,
          set: { value: newValue as never, updated_at: new Date() },
        });
      return existing?.value;
    });

    await this.audit.log({
      adminId,
      action: 'settings.update',
      entityType: 'setting',
      entityId: settingKey,
      before: oldValue ?? null,
      after: newValue,
      ip,
    });
    // Instant propagation — pricing/policy consumers read the new value on
    // their very next request instead of after the 30s TTL.
    this.platformSettings.invalidate();
    this.realtime.broadcastOps('settings');
    return { key: settingKey, value: newValue };
  }

  private assertKnownKey(key: string): SettingKey {
    if (!Object.prototype.hasOwnProperty.call(KNOWN_SETTINGS, key)) {
      throw new BadRequestException(
        `Unknown setting "${key}". Valid keys: ${Object.keys(KNOWN_SETTINGS).join(', ')}`,
      );
    }
    return key as SettingKey;
  }

  private validateValue(key: SettingKey, value: unknown): number | string {
    const spec: SettingSpec = KNOWN_SETTINGS[key];
    if (spec.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`Setting "${key}" must be a finite number.`);
      }
      if (value < spec.min || value > spec.max) {
        throw new BadRequestException(
          `Setting "${key}" must be between ${spec.min} and ${spec.max}.`,
        );
      }
      return value;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`Setting "${key}" must be a string.`);
    }
    if (value.length > spec.maxLength) {
      throw new BadRequestException(
        `Setting "${key}" must be at most ${spec.maxLength} characters.`,
      );
    }
    return value;
  }
}
