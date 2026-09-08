import { buildPoolOptions } from './database.module';

/**
 * Run #43 (DB/Infra rotation) — pool options factory specs.
 * Pins the fail-fast defaults + env overrides that keep a DB stall
 * (Neon cold start / network drop: Sentry API-16/17 class) from wedging
 * API requests on the un-tuned postgres-js default pool.
 */
describe('buildPoolOptions (run #43 pool tuning)', () => {
  it('defaults: max 10, idle_timeout 30s, connect_timeout 10s, ssl off', () => {
    expect(buildPoolOptions({})).toEqual({
      ssl: false,
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  });

  it('SSL_MODE=require pins ssl:"require" (matches prior behavior exactly)', () => {
    expect(buildPoolOptions({ SSL_MODE: 'require' }).ssl).toBe('require');
    expect(buildPoolOptions({ SSL_MODE: 'false' }).ssl).toBe(false);
    expect(buildPoolOptions({ SSL_MODE: undefined }).ssl).toBe(false);
  });

  it('env overrides are honored when valid positive integers', () => {
    expect(
      buildPoolOptions({
        DATABASE_POOL_MAX: '25',
        DATABASE_IDLE_TIMEOUT: '60',
        DATABASE_CONNECT_TIMEOUT: '5',
      }),
    ).toEqual({ ssl: false, max: 25, idle_timeout: 60, connect_timeout: 5 });
  });

  it('garbage, zero, negative and empty fall back to defaults (no 0/Infinity pools)', () => {
    for (const bad of ['abc', '0', '-3', '', undefined]) {
      const opts = buildPoolOptions({ DATABASE_POOL_MAX: bad });
      expect(opts.max).toBe(10);
    }
  });
});
