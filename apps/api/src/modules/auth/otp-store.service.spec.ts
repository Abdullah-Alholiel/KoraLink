import { Cache } from 'cache-manager';
import { OtpStoreService } from './otp-store.service';

/** Minimal in-memory cache honoring TTL — stands in for cache-manager (Redis). */
class MemoryCache implements Pick<Cache, 'get' | 'set' | 'del'> {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + (ttl ?? 0) });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe('OtpStoreService', () => {
  let cache: MemoryCache;
  let otp: OtpStoreService;

  beforeEach(() => {
    cache = new MemoryCache();
    otp = new OtpStoreService(cache as unknown as Cache);
  });

  it('round-trips an OTP', async () => {
    await otp.setOtp('+966500000001', '123456');
    await expect(otp.getOtp('+966500000001')).resolves.toBe('123456');
    await otp.deleteOtp('+966500000001');
    await expect(otp.getOtp('+966500000001')).resolves.toBeUndefined();
  });

  it('cooldown is inactive by default and active after setCooldown', async () => {
    await expect(otp.isCooldownActive('+966500000001')).resolves.toBe(false);
    await otp.setCooldown('+966500000001');
    await expect(otp.isCooldownActive('+966500000001')).resolves.toBe(true);
  });

  it('cooldown expires after 60s', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await otp.setCooldown('+966500000001');
    jest.setSystemTime(new Date('2026-01-01T00:00:59Z'));
    await expect(otp.isCooldownActive('+966500000001')).resolves.toBe(true);
    jest.setSystemTime(new Date('2026-01-01T00:01:01Z'));
    await expect(otp.isCooldownActive('+966500000001')).resolves.toBe(false);
    jest.useRealTimers();
  });

  it('increments the daily counter', async () => {
    await expect(otp.getDailyCount('+966500000001')).resolves.toBe(0);
    await expect(otp.incrementDaily('+966500000001')).resolves.toBe(1);
    await expect(otp.incrementDaily('+966500000001')).resolves.toBe(2);
    await expect(otp.getDailyCount('+966500000001')).resolves.toBe(2);
  });

  it('increments and resets the fail counter', async () => {
    await expect(otp.getFailCount('+966500000001')).resolves.toBe(0);
    await otp.incrementFail('+966500000001');
    await otp.incrementFail('+966500000001');
    await expect(otp.getFailCount('+966500000001')).resolves.toBe(2);
    await otp.resetFails('+966500000001');
    await expect(otp.getFailCount('+966500000001')).resolves.toBe(0);
  });
});
