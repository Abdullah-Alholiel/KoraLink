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

  // ── Run-#53: verify atomicity (mutex + claim/consume) ─────────────────────

  it('runExclusive serializes same-key fns (claim atomicity) and releases on throw', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));

    const first = otp.runExclusive('k', async () => {
      order.push('first:start');
      await gate; // hold the lock
      order.push('first:end');
    });
    const second = otp.runExclusive('k', async () => {
      order.push('second:start');
    });

    await Promise.resolve(); // let both enqueue
    releaseFirst();
    await Promise.all([first, second]);
    // second MUST NOT start before first releases the lock.
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('runExclusive runs different keys concurrently (no cross-phone blocking)', async () => {
    const order: string[] = [];
    let releaseA!: () => void;
    const gate = new Promise<void>((r) => (releaseA = r));

    const a = otp.runExclusive('phone-a', async () => {
      order.push('a:start');
      await gate;
    });
    const b = otp.runExclusive('phone-b', async () => {
      order.push('b:start');
    });
    // Macrotask flush: the mutex chains fns on microtasks, so a single
    // `await Promise.resolve()` does not guarantee both fns started.
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['a:start', 'b:start']); // b ran while a held its lock
    releaseA();
    await Promise.all([a, b]);
  });

  it('a throwing fn releases the lock for the next verifier', async () => {
    await expect(
      otp.runExclusive('k', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(otp.runExclusive('k', async () => 'after')).resolves.toBe('after');
  });

  it('claimChangeOtp claims exactly once: second concurrent claim reads undefined', async () => {
    await otp.setChangeOtp('+966500000001', '123456');
    const [first, second] = await Promise.all([
      otp.claimChangeOtp('+966500000001'),
      otp.claimChangeOtp('+966500000001'),
    ]);
    // Exactly one claimant saw the code; the other got undefined (→ 401).
    const claimed = [first, second].filter((v) => v === '123456');
    expect(claimed).toHaveLength(1);
    await expect(otp.getChangeOtp('+966500000001')).resolves.toBeUndefined();
  });

  it('claimChangeOtp leaves nothing behind and returns undefined when no code exists', async () => {
    await expect(otp.claimChangeOtp('+966500000001')).resolves.toBeUndefined();
  });

  it('consumeChangeOtp runs the mutation then deletes, and propagates failure without deleting', async () => {
    await otp.setChangeOtp('+966500000001', '123456');
    let mutated = false;
    await otp.consumeChangeOtp('+966500000001', async () => {
      mutated = true;
    });
    expect(mutated).toBe(true);
    await expect(otp.getChangeOtp('+966500000001')).resolves.toBeUndefined();

    await otp.setChangeOtp('+966500000001', '654321');
    await expect(
      otp.consumeChangeOtp('+966500000001', async () => {
        throw new Error('db down');
      }),
    ).rejects.toThrow('db down');
    // Failed mutation → the fresh code stays (consume is all-or-nothing per lock hold).
    await expect(otp.getChangeOtp('+966500000001')).resolves.toBe('654321');
  });

  it('withVerifyLock namespaces the lock key per identifier', async () => {
    const order: string[] = [];
    let releaseA!: () => void;
    const gate = new Promise<void>((r) => (releaseA = r));
    const a = otp.withVerifyLock('x', async () => {
      order.push('x:start');
      await gate;
    });
    const b = otp.withVerifyLock('x', async () => order.push('x:2'));
    const c = otp.withVerifyLock('y', async () => order.push('y:start'));
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toContain('y:start'); // different identifier not blocked
    releaseA();
    await Promise.all([a, b, c]);
    expect(order.indexOf('x:start')).toBeLessThan(order.indexOf('x:2'));
  });
});
