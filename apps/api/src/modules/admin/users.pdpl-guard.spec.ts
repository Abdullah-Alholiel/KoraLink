import { BadRequestException, ConflictException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Test } from '@nestjs/testing';
import { AdminUsersService } from './users.service';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { ActivitiesService } from '../activities/activities.service';

/**
 * Run #32 (Reviewer A findings 1+2) — admin users ops API vs PDPL ghosts:
 *
 * 1. `status=active` filter must exclude soft-deleted users. Previously it
 *    matched `banned_at IS NULL AND (suspended_until IS NULL OR <= now())`,
 *    so a deleted ghost (banned_at NULL, suspended_until NULL) displayed as
 *    "active" in the ops table while the default view correctly excluded it.
 *
 * 2. `update()` must refuse moderation mutations (ban/unban/role/suspend) on
 *    a soft-deleted or hard-purged account with 409 — the admin UI hides the
 *    actions for deleted rows; the API now enforces the same rule.
 */
describe('AdminUsersService — PDPL ghost guards (run #32)', () => {
  const GHOST_ID = 'user-ghost-1';

  type SelectCall = { table: unknown; where: unknown };

  function makeDb() {
    const selectCalls: SelectCall[] = [];
    const chain = (): Record<string, unknown> => {
      const c: Record<string, unknown> = {
        orderBy: () => chain(),
        limit: () => chain(),
        offset: () => chain(),
      };
      // Thenable: the count query is awaited directly. Resolves ONE count row
      // (not []) so the last-admin guard path can proceed past count<=1; the
      // list() specs only inspect the rendered WHERE, never the resolved rows.
      c.then = (resolve: (v: unknown) => void) => {
        resolve([{ count: 2 }]);
        return undefined;
      };
      return c;
    };
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: (where: unknown) => {
            selectCalls.push({ table, where });
            return chain();
          },
        }),
      }),
      _selectCalls: selectCalls,
    };
    return db;
  }

  async function makeService(db: ReturnType<typeof makeDb>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: 'DB_CONNECTION', useValue: db },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: RealtimeService, useValue: { broadcastOps: jest.fn() } },
        {
          provide: ActivitiesService,
          useValue: { record: jest.fn() },
        },
      ],
    }).compile();

    return moduleRef.get(AdminUsersService);
  }

  it('status=active excludes deleted users in the SQL predicate', async () => {
    const db = makeDb();
    const svc = await makeService(db);
    await svc.list({ status: 'active' } as never);
    const listCall = db._selectCalls[0];
    const rendered = dialect(listCall.where);
    expect(rendered).toContain('"users"."deleted_at" IS NULL');
    expect(rendered).toContain('"users"."banned_at" IS NULL');
    expect(rendered).toContain('now()');
  });

  it('status=banned matches banned ghosts too (deleted_at NOT required)', async () => {
    const db = makeDb();
    const svc = await makeService(db);
    await svc.list({ status: 'banned' } as never);
    const rendered = dialect(db._selectCalls[0].where);
    expect(rendered).toContain('"users"."banned_at" IS NOT NULL');
    expect(rendered).not.toContain('"users"."deleted_at"');
  });

  it('update() on a soft-deleted account is a 409 Conflict before any write', async () => {
    const db = makeDb();
    const svc = await makeService(db);
    jest
      .spyOn(svc, 'findOne')
      .mockResolvedValue({
        id: GHOST_ID,
        deleted_at: new Date('2026-09-01T00:00:00Z'),
        role: 'Player',
      } as never);
    await expect(
      svc.update(GHOST_ID, { banned: true } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    // Guard fires BEFORE the UPDATE: no db.update call exists in this service
    // path; the spy-based findOne means no second select ran either.
    expect(db._selectCalls).toHaveLength(0);
  });

  it('update() with no changes still 400s on a LIVE account (guard does not shadow)', async () => {
    const db = makeDb();
    const svc = await makeService(db);
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      id: 'live-1',
      deleted_at: null,
      role: 'Player',
    } as never);
    await expect(
      svc.update('live-1', {} as never, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('last-admin protection counts only LIVING admins (deleted_at IS NULL — run #34)', async () => {
    const db = makeDb();
    // Let the post-guard UPDATE resolve so the guard path runs to completion.
    (db as { update?: unknown }).update = () => ({
      set: () => ({ where: () => Promise.resolve() }),
    });
    const svc = await makeService(db);
    // Target is a LIVING admin (ghost 409 must NOT fire) being demoted.
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      id: 'admin-2',
      deleted_at: null,
      role: 'Admin',
    } as never);
    await svc.update('admin-2', { role: 'Player' } as never, 'admin-1');
    // Exactly one select ran: the last-admin count query.
    expect(db._selectCalls).toHaveLength(1);
    const rendered = dialect(db._selectCalls[0].where);
    // role is a bind param ($1) in the rendered SQL — assert the predicate exists;
    // the ghost tripwires below are the point of this spec.
    expect(rendered).toContain('"users"."role" = $1');
    // Tripwire: ghosts are not living admins (run #34 — without this clause a
    // soft-deleted/purged admin satisfied the guard and the last living admin
    // could be demoted away).
    expect(rendered).toContain('"users"."deleted_at" IS NULL');
    expect(rendered).toContain('"users"."banned_at" IS NULL');
    expect(rendered).toContain('now()');
  });
});

/** Render a captured drizzle predicate the way the SQL-tripwire specs do. */
function dialect(where: unknown): string {
  return new PgDialect().sqlToQuery(where as SQL).sql;
}
