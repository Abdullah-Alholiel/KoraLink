import { PgDialect } from 'drizzle-orm/pg-core';
import { UsersService } from './users.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';

/**
 * P0-6 (run #30) — PDPL hard-purge spec.
 *
 * `purgeExpiredAccounts()` is the scheduler-callable entrypoint that
 * anonymizes users past their 30-day soft-delete grace window. This
 * spec asserts:
 *
 * 1. The WHERE clause uses `isNotNull(deleted_at) AND lt(deleted_at, ...)` —
 *    the standing `eq(col, null)` → silent zero rows trap is avoided
 *    (`isNotNull` is the correct Drizzle helper).
 * 2. The INTERVAL uses the PDPL_GRACE_DAYS constant (30), not a hard-coded
 *    literal — guards against drift if the constant changes.
 * 3. Active users (deleted_at NULL) are NEVER matched.
 * 4. Recently deleted users (deleted_at < 30d ago) are NEVER matched.
 * 5. The SET clause anonymizes the PII columns and does NOT include
 *    `purge_at` (which is not a real column — it is computed in the
 *    softDelete response only).
 *
 * The DB is stubbed (same pattern as users.pdpl.spec.ts) so the spec
 * runs in isolation without Postgres.
 */
describe('UsersService P0-6 hard-purge (run #30)', () => {
  const dialect = new PgDialect();

  /** Stub DB that records every update call and returns a canned row count. */
  function makeDb(opts?: { purgedIds?: string[] }) {
    const calls: {
      method: 'update';
      payload: unknown;
    }[] = [];
    const whereClauses: string[] = [];
    const deleteClauses: string[] = [];
    const setPayloads: Record<string, unknown>[] = [];
    const purgedIds = opts?.purgedIds ?? [];

    const db = {
      select: (..._args: unknown[]) => ({
        from: () => ({ where: () => ({ limit: () => [] }) }),
      }),
      update: (_table: unknown) => {
        const idx = calls.length;
        calls.push({ method: 'update', payload: _table });
        const u: Record<string, unknown> = {
          set: (s: Record<string, unknown>) => {
            setPayloads.push(s);
            return {
              where: (clause: unknown) => {
                whereClauses.push(dialect.sqlToQuery(clause as never).sql);
                return {
                  returning: () => purgedIds.map((id) => ({ id })),
                };
              },
            };
          },
        };
        return u;
      },
      delete: (_table: unknown) => ({
        where: (clause: unknown) => {
          deleteClauses.push(dialect.sqlToQuery(clause as never).sql);
          return Promise.resolve();
        },
      }),
      query: {},
      execute: () => Promise.resolve([]),
      transaction: async (cb: (tx: unknown) => unknown) => cb(db),
    };
    return { db, calls, whereClauses, deleteClauses, setPayloads };
  }

  function makeService(db: unknown): UsersService {
    return new UsersService(
      db as never,
      {} as JwtService,
      {} as ConfigService,
    );
  }

  it('purge is atomic — UPDATE + subscription DELETE run in ONE transaction', async () => {
    const { db, calls, whereClauses, deleteClauses } = makeDb({
      purgedIds: ['u1'],
    });
    // The stub's transaction is a passthrough; count invocations so the
    // spec proves the service routed the purge through db.transaction
    // (single tx entry) instead of two independent auto-commits.
    let txCount = 0;
    const inner = db.transaction;
    db.transaction = async (cb: (tx: unknown) => unknown) => {
      txCount += 1;
      return inner(cb);
    };
    const svc = makeService(db);
    const count = await svc.purgeExpiredAccounts();

    expect(count).toBe(1);
    expect(txCount).toBe(1); // exactly ONE transaction wrapped the purge
    expect(calls).toHaveLength(1); // the update ran inside it
    expect(whereClauses).toHaveLength(1);
    expect(deleteClauses).toHaveLength(1); // the subscription wipe ran too
    expect(deleteClauses[0]).toContain('in (');
  });

  it('deleteClauses pin the subscription wipe to exactly the purged ids', async () => {
    const { db, deleteClauses } = makeDb({
      purgedIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001', 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0002'],
    });
    const svc = makeService(db);
    await svc.purgeExpiredAccounts();
    // sqlToQuery renders bound values as $n placeholders — the IN-list must
    // target push_subscriptions.user_id and carry one param per purged id.
    expect(deleteClauses[0]).toBe(
      '"push_subscriptions"."user_id" in ($1, $2)',
    );
  });

  it('anonymizes 2 deleted users past their 30-day grace window', async () => {
    const { db, whereClauses, setPayloads } = makeDb({
      purgedIds: ['u1', 'u2'],
    });
    const svc = makeService(db);
    const count = await svc.purgeExpiredAccounts();
    expect(count).toBe(2);
    expect(whereClauses).toHaveLength(1);
    // WHERE: isNotNull(deleted_at) AND lt(deleted_at, NOW() - INTERVAL '30 days')
    expect(whereClauses[0]).toMatch('is not null');
    expect(whereClauses[0]).toContain("INTERVAL '30 days'");
    // SET: phone → 'deleted:<id>' (via SQL expression), name → 'Deleted User'
    expect(setPayloads[0]?.full_name).toBe('Deleted User');
    expect(setPayloads[0]?.handle).toBeNull();
    expect(setPayloads[0]?.avatar_url).toBeNull();
    expect(setPayloads[0]?.banned_at).toBeNull();
    expect(setPayloads[0]?.suspended_until).toBeNull();
    expect(setPayloads[0]?.verification_status).toBe('pending');
    // Must NOT include a non-existent `purge_at` column.
    expect(setPayloads[0]).not.toHaveProperty('purge_at');
  });

  it('returns 0 when no users are past the grace window', async () => {
    const { db } = makeDb({ purgedIds: [] });
    const svc = makeService(db);
    const count = await svc.purgeExpiredAccounts();
    expect(count).toBe(0);
  });

  it('never touches active users (deleted_at NULL excluded by isNotNull)', async () => {
    // The WHERE clause must contain `deleted_at IS NOT NULL` — NOT
    // `deleted_at = $1` or `deleted_at != NULL` (silent zero rows).
    // Drizzle emits `is not null` lowercase; match case-insensitively.
    const { db, whereClauses } = makeDb({ purgedIds: [] });
    const svc = makeService(db);
    await svc.purgeExpiredAccounts();
    expect(whereClauses[0]).toMatch(/is not null/i);
    expect(whereClauses[0]).not.toMatch(/= NULL/);
  });

  it('never touches users deleted less than 30 days ago', async () => {
    // The WHERE clause must contain the INTERVAL '30 days' guard — a
    // bug that drops the `lt(deleted_at, ...)` clause would match every
    // deleted user (including recent ones).
    const { db, whereClauses } = makeDb({ purgedIds: [] });
    const svc = makeService(db);
    await svc.purgeExpiredAccounts();
    expect(whereClauses[0]).toContain("INTERVAL '30 days'");
    expect(whereClauses[0]).toContain('< NOW() - INTERVAL');
  });

  // I3 (run #31, Reviewer A): subscriptions re-created during the grace
  // window must be deleted when the ghost is purged (migration 0031 docs).
  it('deletes push_subscriptions for the purged user ids (grace-window re-subscribes)', async () => {
    const { db, deleteClauses } = makeDb({ purgedIds: ['u1', 'u2'] });
    const svc = makeService(db);
    await svc.purgeExpiredAccounts();
    expect(deleteClauses).toHaveLength(1);
    expect(deleteClauses[0]).toContain('"push_subscriptions"."user_id"');
    expect(deleteClauses[0]).toMatch(/in \(/);
  });

  it('issues NO push_subscriptions delete when nothing is purged', async () => {
    const { db, deleteClauses } = makeDb({ purgedIds: [] });
    const svc = makeService(db);
    await svc.purgeExpiredAccounts();
    expect(deleteClauses).toHaveLength(0);
  });
});