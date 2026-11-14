import { PgDialect } from 'drizzle-orm/pg-core';
import { UsersService } from './users.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';

/**
 * Run #181 (Reviewer A I-1) — restoreUser is a GUARDED conditional write.
 *
 * The clear (`deleted_at = NULL`) must carry a `deleted_at IS NOT NULL`
 * predicate so a concurrent deleteMyAccount() between the grace-window read
 * and the UPDATE can never resurrect an account that just re-entered the
 * deletion window (PDPL TOCTOU). These specs pin:
 *  1. the WHERE clause shape (tripwire against predicate removal),
 *  2. the happy path (row returned → populated profile),
 *  3. the three 0-rows outcomes: already-active no-op, re-deleted → 409,
 *     expired → 400 window copy.
 */
describe('UsersService restoreUser guarded write (run #181)', () => {
  const dialect = new PgDialect();

  interface Opts {
    /** Result of the guarded UPDATE ... RETURNING. */
    updateReturning?: { deleted_at: Date | null }[];
    /** Result of the post-race re-read (undefined = row vanished). */
    reread?: { deleted_at: Date | null }[];
    /** Initial (pre-update) read of the user row. */
    initial: { id: string; deleted_at: Date | null };
  }

  function makeDb(opts: Opts) {
    const whereClauses: string[] = [];
    let selectCall = 0;

    const db = {
      select: (_projection?: unknown) => {
        const idx = selectCall++;
        const q = {
          from: () => q,
          where: (clause: unknown) => {
            whereClauses.push(dialect.sqlToQuery(clause as never).sql);
            return {
              limit: () => (idx === 0 ? [opts.initial] : (opts.reread ?? [])),
            };
          },
        };
        return q;
      },
      update: (_table: unknown) => {
        const u = {
          set: (_s: Record<string, unknown>) => ({
            where: (clause: unknown) => {
              whereClauses.push(dialect.sqlToQuery(clause as never).sql);
              return {
                returning: () => opts.updateReturning ?? [{ deleted_at: null }],
              };
            },
          }),
        };
        return u;
      },
      query: {
        users: {
          findFirst: async () => ({
            id: opts.initial.id,
            phone: '+966****0001',
            full_name: 'Restore Tester',
            handle: 'restore-tester',
            avatar_url: null,
            role: 'Player',
            wallet_balance: '0',
            karma_score: 0,
            no_show_count: 0,
            home_lat: null,
            home_lng: null,
            push_muted: false,
            email: null,
            email_verified_at: null,
            email_muted: false,
            locale: 'ar',
            quiet_hours_enabled: false,
            quiet_start_hour: 22,
            quiet_end_hour: 7,
            created_at: new Date('2026-01-01T00:00:00Z'),
          }),
        },
      },
      execute: async () => [{ pom_count: 0 }],
    };
    return { db, whereClauses };
  }

  function makeService(db: unknown) {
    const jwt = { sign: () => 'signed.tok' } as unknown as JwtService;
    const config = { get: (_k: string, d?: string) => d } as unknown as ConfigService;
    return new UsersService(db as never, jwt, config);
  }

  const recentDeletion = () => new Date(Date.now() - 1 * 86_400_000); // 1 day ago

  it('happy path: guarded UPDATE carries the IS NOT NULL predicate and returns the profile', async () => {
    const { db, whereClauses } = makeDb({
      initial: { id: 'u1', deleted_at: recentDeletion() },
      updateReturning: [{ deleted_at: null }],
    });
    const service = makeService(db);

    const result = await service.restoreUser('u1');
    expect(result.id).toBe('u1');

    // The UPDATE where-clause (last one recorded) must include the
    // `deleted_at is not null` guard — removing it reintroduces the
    // resurrection TOCTOU.
    const updateWhere = whereClauses[whereClauses.length - 1];
    expect(updateWhere).toContain('"users"."id"');
    expect(updateWhere.toLowerCase()).toContain('"deleted_at" is not null');
  });

  it('race: guarded update hits 0 rows + user is active again → idempotent no-op profile', async () => {
    const { db } = makeDb({
      initial: { id: 'u1', deleted_at: recentDeletion() },
      updateReturning: [],
      reread: [{ deleted_at: null }],
    });
    const service = makeService(db);

    const result = await service.restoreUser('u1');
    expect(result.id).toBe('u1'); // no-throw = no-op path
  });

  it('race: guarded update hits 0 rows + user re-deleted fresh → 409, never resurrected', async () => {
    const { db } = makeDb({
      initial: { id: 'u1', deleted_at: recentDeletion() },
      updateReturning: [],
      reread: [{ deleted_at: new Date(Date.now() - 60_000) }], // deleted again 1 min ago
    });
    const service = makeService(db);

    await expect(service.restoreUser('u1')).rejects.toThrow(/deleted again during restore/);
  });

  it('race: guarded update hits 0 rows + re-deletion already past grace → 400 window copy', async () => {
    const { db } = makeDb({
      initial: { id: 'u1', deleted_at: recentDeletion() },
      updateReturning: [],
      reread: [{ deleted_at: new Date(Date.now() - 31 * 86_400_000) }],
    });
    const service = makeService(db);

    await expect(service.restoreUser('u1')).rejects.toThrow(/Restore window expired/);
  });

  it('still throws 404 when the initial read finds no user', async () => {
    const made = makeDb({ initial: { id: 'u1', deleted_at: null } });
    // override: empty initial read (chain must stay fluent: select().from().where().limit())
    (made.db as unknown as { select: () => unknown }).select = () => {
      const q = {
        from: () => q,
        where: () => ({ limit: () => [] }),
      };
      return q;
    };
    const service = makeService(made.db);
    await expect(service.restoreUser('u-missing')).rejects.toThrow(/User not found/);
  });
});
