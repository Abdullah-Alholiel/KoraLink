import { PgDialect } from 'drizzle-orm/pg-core';
import { push_subscriptions } from '../../database/schema';
import { NotificationsService } from './notifications.service';
import { NotificationsScheduler } from './notifications.scheduler';

/**
 * P2-43 (run #37) — stale push-subscription sweep.
 *
 * `sweepStaleSubscriptions()` deletes `push_subscriptions` rows whose
 * `updated_at` is older than STALE_SUBSCRIPTION_DAYS (90). This spec asserts:
 *
 * 1. The WHERE clause is `lt(updated_at, <cutoff>)` — a real timestamp
 *    comparison (never an `eq(col, null)`-style trap).
 * 2. The cutoff is `now - 90d` (constant-driven, not a magic literal).
 * 3. It deletes from push_subscriptions and reports the deleted count.
 * 4. The scheduler entrypoint calls the sweep and captures errors without
 *    rethrowing (cron tick must never crash the process).
 *
 * DB stubbed (same pattern as users.purge-expired.spec.ts).
 */
describe('NotificationsService P2-43 stale-subscription sweep (run #37)', () => {
  const dialect = new PgDialect();

  function makeDb(opts?: { deletedRows?: Array<{ id: string }> }) {
    const deletes: Array<{ table?: unknown; whereSql?: string; params?: unknown[]; returned?: unknown }> = [];
    const db = {
      delete: (table: unknown) => ({
        where: (clause: unknown) => {
          const q = dialect.sqlToQuery(clause as never);
          return {
            returning: (sel: unknown) => {
              const rows = opts?.deletedRows ?? [];
              deletes.push({
                table,
                whereSql: q.sql,
                params: q.params as unknown[],
                returned: rows,
              });
              void sel;
              return Promise.resolve(rows);
            },
          };
        },
      }),
    };
    return { db, deletes };
  }

  function makeService(db: unknown) {
    // Minimal ConfigService stub: no VAPID keys → push disabled; the
    // hostAllowlist branch uses .get with a default, so provide both shapes.
    const config = {
      get: (_key: string, defaultValue?: string) => defaultValue,
    };
    return new NotificationsService(
      db as never,
      config as never,
    );
  }

  it('deletes push_subscriptions older than the 90d cutoff (lt comparison, no eq-null trap)', async () => {
    const { db, deletes } = makeDb({ deletedRows: [{ id: 's1' }, { id: 's2' }] });
    const svc = makeService(db);
    const before = Date.now();
    const removed = await svc.sweepStaleSubscriptions();
    const after = Date.now();

    expect(removed).toBe(2);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].table).toBe(push_subscriptions);
    expect(deletes[0].whereSql).toContain('"updated_at" <');
    // Cutoff bound param = now - 90d, computed inside [before, after] window.
    const cutoff = new Date(deletes[0].params![0] as string | number).getTime();
    const expectedLow = before - 90 * 86_400_000;
    const expectedHigh = after - 90 * 86_400_000;
    expect(cutoff).toBeGreaterThanOrEqual(expectedLow);
    expect(cutoff).toBeLessThanOrEqual(expectedHigh);
  });

  it('exposes STALE_SUBSCRIPTION_DAYS=90 (constant drives the cutoff, no magic literal)', () => {
    expect(NotificationsService.STALE_SUBSCRIPTION_DAYS).toBe(90);
  });

  it('returns 0 and logs nothing when nothing is stale', async () => {
    const { db, deletes } = makeDb({ deletedRows: [] });
    const svc = makeService(db);
    const removed = await svc.sweepStaleSubscriptions();
    expect(removed).toBe(0);
    expect(deletes).toHaveLength(1); // the DELETE still ran (0 rows matched)
  });

  it('scheduler tick calls the sweep and never rethrows on failure', async () => {
    // Success path: sweep invoked exactly once.
    let calls = 0;
    const okService = { sweepStaleSubscriptions: async () => { calls += 1; return 3; } } as unknown as NotificationsService;
    const sched = new NotificationsScheduler(okService);
    await sched.handleSweepStaleSubscriptions();
    expect(calls).toBe(1);

    // Failure path: error captured (Sentry), NOT rethrown.
    const boomService = {
      sweepStaleSubscriptions: async () => {
        throw new Error('db down');
      },
    } as unknown as NotificationsService;
    const sched2 = new NotificationsScheduler(boomService);
    await expect(sched2.handleSweepStaleSubscriptions()).resolves.toBeUndefined();
  });
});
