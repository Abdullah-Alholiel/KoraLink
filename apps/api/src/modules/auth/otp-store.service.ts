import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

const OTP_PREFIX = 'otp:';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_COOLDOWN_MS = 60 * 1000; // 60s resend cooldown
const OTP_DAILY_CAP = 10; // max SMS per phone per rolling 24h
const OTP_FAIL_LIMIT = 5; // verify attempts before lockout
const OTP_LOCKOUT_MS = 15 * 60 * 1000; // 15min lockout
const DAY_MS = 24 * 60 * 60 * 1000;

const keys = {
  otp: (phone: string) => `${OTP_PREFIX}${phone}`,
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
  day: (phone: string) => `otp:day:${phone}`,
  fails: (phone: string) => `otp:fails:${phone}`,
};

/**
 * OTP storage + abuse protection, all backed by the shared cache-manager
 * (Redis in production). Counters use a sliding TTL: they reset
 * `OTP_LOCKOUT_MS` / 24h after the last increment, which is a safe window for
 * rate limiting (get+set is not atomic, but the windows are generous enough
 * that a race is immaterial).
 */
@Injectable()
export class OtpStoreService {
  static readonly DAILY_CAP = OTP_DAILY_CAP;
  static readonly FAIL_LIMIT = OTP_FAIL_LIMIT;
  static readonly COOLDOWN_MS = OTP_COOLDOWN_MS;
  static readonly LOCKOUT_MS = OTP_LOCKOUT_MS;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async setOtp(phone: string, code: string): Promise<void> {
    await this.cache.set(keys.otp(phone), code, OTP_TTL_MS);
  }

  async getOtp(phone: string): Promise<string | undefined> {
    return this.cache.get<string>(keys.otp(phone));
  }

  async deleteOtp(phone: string): Promise<void> {
    await this.cache.del(keys.otp(phone));
  }

  // ── Resend cooldown ─────────────────────────────────────────────────────

  async isCooldownActive(phone: string): Promise<boolean> {
    return !!(await this.cache.get(keys.cooldown(phone)));
  }

  async setCooldown(phone: string): Promise<void> {
    await this.cache.set(keys.cooldown(phone), '1', OTP_COOLDOWN_MS);
  }

  // ── Daily SMS cap ───────────────────────────────────────────────────────

  async getDailyCount(phone: string): Promise<number> {
    return (await this.cache.get<number>(keys.day(phone))) ?? 0;
  }

  async incrementDaily(phone: string): Promise<number> {
    const next = ((await this.cache.get<number>(keys.day(phone))) ?? 0) + 1;
    await this.cache.set(keys.day(phone), next, DAY_MS);
    return next;
  }

  // ── Verify attempt lockout ──────────────────────────────────────────────

  async getFailCount(phone: string): Promise<number> {
    return (await this.cache.get<number>(keys.fails(phone))) ?? 0;
  }

  async incrementFail(phone: string): Promise<number> {
    const next = ((await this.cache.get<number>(keys.fails(phone))) ?? 0) + 1;
    await this.cache.set(keys.fails(phone), next, OTP_LOCKOUT_MS);
    return next;
  }

  async resetFails(phone: string): Promise<void> {
    await this.cache.del(keys.fails(phone));
  }
}
