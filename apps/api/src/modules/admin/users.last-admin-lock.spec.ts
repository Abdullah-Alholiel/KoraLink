import { BadRequestException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Test } from '@nestjs/testing';
import { AdminUsersService } from './users.service';
import { AuditService } from './audit.service';
import { RealtimeService } from '../gateway/realtime.service';
import { ActivitiesService } from '../activities/activities.service';
import { AppGateway } from '../gateway/app.gateway';

/**
 * P2-116 (Reviewer A, run #78): the last-admin guard was a plain
 * count-then-write — two concurrent demotes of the final two admins could
 * both observe count 2 and both succeed, leaving ZERO living admins and
 * locking everyone out of the HQ console.
 *
 * The guard now runs INSIDE a transaction that first locks ALL living-admin
 * rows FOR UPDATE (deterministic ORDER BY id), so the pair of concurrent
 * demotes serializes: the loser re-counts against post-winner state, sees
 * count 1, and 400s. These specs pin, at the mock-DB level:
 *
 *  1. the guard tx exists at all (a demote of an Admin opens a transaction);
 *  2. the FIRST statement in that tx is the living-admin FOR UPDATE lock
 *     (both the FOR UPDATE keyword and the ghost-excluding predicates —
 *     regression tripwire for run #34's living-admin semantics);
 *  3. the in-tx count predicate still excludes PDPL ghosts;
 *  4. count<=1 still refuses BEFORE any write.
 */
describe('AdminUsersService — last-admin guard transaction (P2-116)', () => {
  function makeDb(initialCount = 2) {
    const statements: Array<{ kind: 'raw' | 'count'; sql?: string; where?: unknown }> =
      [];
    const updateCalls: Array<Record<string, unknown>> = [];

    const countChain = () => {
      const c: Record<string, unknown> = {};
      c.from = (_table: unknown) => ({
        where: (where: unknown) => {
          statements.push({ kind: 'count', where });
          return Promise.resolve([{ count: initialCount }]);
        },
      });
      return c;
    };

    const tx = {
      execute: (query: unknown) => {
        // Rendered eagerly so the raw lock statement can be asserted.
        const rendered = new PgDialect().sqlToQuery(query as never);
        statements.push({ kind: 'raw', sql: rendered.sql });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
      select: () => countChain(),
      update: (_table: unknown) => ({
        set: (payload: Record<string, unknown>) => ({
          where: (_where: unknown) => {
            updateCalls.push(payload);
            return Promise.resolve();
          },
        }),
      }),
    };

    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
      select: () => countChain(),
      update: (_table: unknown) => ({
        set: (payload: Record<string, unknown>) => ({
          where: (_where: unknown) => {
            updateCalls.push(payload);
            return Promise.resolve();
          },
        }),
      }),
      _statements: statements,
      _updateCalls: updateCalls,
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
        { provide: ActivitiesService, useValue: { record: jest.fn() } },
        { provide: AppGateway, useValue: { disconnectUser: jest.fn() } },
      ],
    }).compile();
    const svc = moduleRef.get(AdminUsersService);
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      id: 'admin-2',
      deleted_at: null,
      role: 'Admin',
      banned_at: null,
      suspended_until: null,
    } as never);
    return svc;
  }

  it('demoting an Admin runs the guard INSIDE a transaction (tx path exists)', async () => {
    const db = makeDb(2);
    const svc = await makeService(db);
    await svc.update('admin-2', { role: 'Player' } as never, 'admin-1');
    // Exactly one tx-count ran (the guard); the post-write findOne is a spy.
    const counts = db._statements.filter((s) => s.kind === 'count');
    expect(counts).toHaveLength(1);
    // The write happened AFTER the guard tx (db.update, not tx-only).
    expect(db._updateCalls).toHaveLength(1);
  });

  it('FIRST guard statement is the living-admin FOR UPDATE lock (ORDER BY id)', async () => {
    const db = makeDb(2);
    const svc = await makeService(db);
    await svc.update('admin-2', { role: 'Player' } as never, 'admin-1');
    const raw = db._statements.find((s) => s.kind === 'raw');
    expect(raw).toBeDefined();
    expect(raw!.sql).toContain('FOR UPDATE');
    expect(raw!.sql).toContain('ORDER BY id');
    // Lock scope = LIVING admins (run #34 semantics must hold in the lock too).
    expect(raw!.sql).toContain('"users"."deleted_at" IS NULL');
    expect(raw!.sql).toContain('"users"."banned_at" IS NULL');
    expect(raw!.sql).toContain('now()');
    // The lock precedes the in-tx count in statement order.
    const rawIdx = db._statements.indexOf(raw!);
    const countIdx = db._statements.findIndex((s) => s.kind === 'count');
    expect(rawIdx).toBeLessThan(countIdx);
  });

  it('in-tx count predicate still excludes PDPL ghosts (role bind param rendered)', async () => {
    const db = makeDb(2);
    const svc = await makeService(db);
    await svc.update('admin-2', { role: 'Player' } as never, 'admin-1');
    const countStmt = db._statements.find((s) => s.kind === 'count')!;
    const rendered = new PgDialect().sqlToQuery(countStmt.where as SQL).sql;
    expect(rendered).toContain('"users"."role" = $1');
    expect(rendered).toContain('"users"."deleted_at" IS NULL');
    expect(rendered).toContain('"users"."banned_at" IS NULL');
    expect(rendered).toContain('now()');
  });

  it('count<=1 refuses with 400 BEFORE any write (single remaining admin)', async () => {
    const db = makeDb(1);
    const svc = await makeService(db);
    await expect(
      svc.update('admin-2', { role: 'Player' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db._updateCalls).toHaveLength(0);
  });
});
