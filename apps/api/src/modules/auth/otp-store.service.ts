import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

const OTP_PREFIX = 'otp:';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_COOLDOWN_MS = 60 * 1000; // 60s resend cooldown
const OTP_DAILY_CAP = 10; // max SMS per phone per rolling 24h
const OTP_DAILY_IP_CAP = 50; // P2-19 (run #27): max SMS per source IP per rolling 24h
const OTP_FAIL_LIMIT = 5; // verify attempts before lockout
const OTP_LOCKOUT_MS = 15 * 60 * 1000; // 15min lockout
const DAY_MS = 24 * 60 * 60 * 1000;

const keys = {
  otp: (phone: string) => `${OTP_PREFIX}${phone}`,
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
  day: (phone: string) => `otp:day:${phone}`,
  ip_day: (ip: string) => `otp:ip_day:${ip}`,
  fails: (phone: string) => `otp:fails:${phone}`,
  // P1-19 (run #44): phone-change flow — separate namespace so a login OTP
  // can never verify a phone change (and vice versa).
  changeOtp: (phone: string) => `${OTP_PREFIX}change:${phone}`,
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
  static readonly DAILY_IP_CAP = OTP_DAILY_IP_CAP;
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

  // ── Per-IP daily SMS cap (P2-19, run #27) ────────────────────────────────
  // Bounds SMS pumping from a single source — a bot net rotating phones
  // against one IP still drains the Unifonic budget. Same cache + sliding
  // TTL as the per-phone counter; the cap is a constant tunable in one
  // place (DAILY_IP_CAP).

  async getIpDailyCount(ip: string): Promise<number> {
    return (await this.cache.get<number>(keys.ip_day(ip))) ?? 0;
  }

  async incrementIpDaily(ip: string): Promise<number> {
    const next = ((await this.cache.get<number>(keys.ip_day(ip))) ?? 0) + 1;
    await this.cache.set(keys.ip_day(ip), next, DAY_MS);
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

  // ── Phone-change flow OTP (P1-19, run #44) ───────────────────────────────
  // SEPARATE key namespace from the login OTP. A login OTP stored under
  // otp:<phone> can NEVER satisfy a phone-change verification, and a
  // change-flow code can never be replayed as a login (both directions).
  // Abuse caps (cooldown, per-phone daily, per-IP daily, fail lockout) are
  // SHARED with the login flow — one budget across both surfaces.
  async getChangeOtp(phone: string): Promise<string | undefined> {
    return this.cache.get<string>(keys.changeOtp(phone));
  }

  async setChangeOtp(phone: string, code: string): Promise<void> {
    await this.cache.set(keys.changeOtp(phone), code, OTP_TTL_MS);
  }

  async deleteChangeOtp(phone: string): Promise<void> {
    await this.cache.del(keys.changeOtp(phone));
  }

  // ── Verify atomicity (run #53: OTP verify TOCTOU) ────────────────────────
  // cache-manager get/set is NOT atomic (documented above), so the classic
  // verify shape get → compare → delete double-spends under concurrency: two
  // requests read the same fresh code before either delete lands (one code →
  // two sessions / two phone flips). Fix: serialize each phone's verify path
  // through a per-key promise-chain mutex and do compare+delete INSIDE the
  // lock. A wrong code keeps the stored OTP visible to the next attempt
  // (typo-retry UX unchanged); a correct code is consumed exactly once.
  // Lock keys are namespaced ('verify:…' / 'change:…') so the login, email,
  // and phone-change flows never contend with each other or with sends.
  private readonly verifyMutex = new Map<string, Promise<unknown>>();

  /**
   * Run `fn` while holding the per-key verify mutex. Keys should be
   * namespaced by the caller (e.g. `verify:<phone>`); unrelated keys never
   * block each other. The chain entry is removed in `finally`, so a throwing
   * `fn` releases the lock for later verifiers instead of poisoning it.
   */
  runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.verifyMutex.get(key) ?? Promise.resolve();
    const release = () => {
      // Drop the chain entry only while it still points at our tail — a
      // newer verifier that chained after us must keep its link.
      if (this.verifyMutex.get(key) === tail) this.verifyMutex.delete(key);
    };
    const tail = prev.catch(() => undefined).then(fn);
    this.verifyMutex.set(key, tail);
    return tail.finally(release);
  }

  /** Namespaced verify lock for a phone/email identifier. */
  withVerifyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.runExclusive(`verify:${key}`, fn);
  }

  /**
   * Atomic claim-and-consume for the phone-change OTP: inside the change
   * lock, read the scoped code and delete it if present. A concurrent
   * verifier either claims the code first (winner) or reads undefined
   * (loser → 401); the code can never satisfy two verifications.
   */
  async claimChangeOtp(phone: string): Promise<string | undefined> {
    return this.runExclusive(`change:${phone}`, async () => {
      const stored = await this.getChangeOtp(phone);
      if (stored !== undefined) await this.deleteChangeOtp(phone);
      return stored;
    });
  }

  /**
   * Hold the change lock while the verified DB mutation runs, then consume
   * (delete + reset fails) inside the same lock. Pair with `claimChangeOtp`:
   * claim decides the winner, consume commits the flip under the lock so a
   * concurrent verify cannot interleave between decision and consumption.
   */
  async consumeChangeOtp(
    phone: string,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    await this.runExclusive(`change:${phone}`, async () => {
      await fn();
      await this.deleteChangeOtp(phone);
    });
  }
}
