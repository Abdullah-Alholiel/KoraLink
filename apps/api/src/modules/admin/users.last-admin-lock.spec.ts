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
 * Architecture pinned here (v2, after the PR-Agent review caught v1):
 * the guard AND THE WRITE share ONE transaction that first locks ALL
 * living-admin rows FOR UPDATE. v1 released the locks at guard-commit and
 * wrote on the outer db afterwards — the race window survived. These specs
 * fail if the write ever leaves the lock-holding tx again:
 *
 *  1. an admin-targeted demote runs the guard tx AND writes INSIDE it
 *     (tx.update carries the payload; the outer db issues nothing);
 *  2. the FIRST statement in the tx is the living-admin FOR UPDATE lock
 *     (deterministic ORDER BY id, ghost-excluding predicates — run #34
 *     semantics hold in the lock scope);
 *  3. the in-tx count predicate still excludes PDPL ghosts;
 *  4. count<=1 throws INSIDE the tx → 400 with zero writes anywhere;
 *  5. non-admin targets keep the plain single-statement path (no tx).
 */
describe('AdminUsersService — last-admin guard transaction (P2-116)', () => {
  function makeDb(initialCount = 2) {
    const statements: Array<{ kind: 'raw' | 'count'; sql?: string; where?: unknown }> = [];
    const txUpdates: Array<Record<string, unknown>> = [];
    const outerUpdates: Array<Record<string, unknown>> = [];

    const makeUpdater = (sink: Array<Record<string, unknown>>) => (
      _table: unknown,
    ) => ({
      set: (payload: Record<string, unknown>) => ({
        where: (_where: unknown) => {
          sink.push(payload);
          return Promise.resolve();
        },
      }),
    });

    const txCountChain = () => {
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
      select: () => txCountChain(),
      update: makeUpdater(txUpdates),
    };

    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
      update: makeUpdater(outerUpdates),
      _statements: statements,
      _txUpdates: txUpdates,
      _outerUpdates: outerUpdates,
    };
    return db;
  }

  async function makeService(
    db: ReturnType<typeof makeDb>,
    targetRole: 'Admin' | 'Player' = 'Admin',
  ) {
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
      role: targetRole,
      banned_at: null,
      suspended_until: null,
    } as never);
    return svc;
  }

  it('admin demote: guard tx runs AND the write is tx-internal (v2 race fix)', async () => {
    const db = makeDb(2);
    const svc = await makeService(db);
    await svc.update('admin-2', { role: 'Player' } as never, 'admin-1');
    // The lock statement ran (guard tx opened).
    expect(db._statements.some((s) => s.kind === 'raw')).toBe(true);
    // THE PIN: the write went through tx.update — the outer db issued none.
    // (v1 wrote on the outer db after the tx committed; PR-Agent run #79
    // flagged the surviving race window.)
    expect(db._txUpdates).toHaveLength(1);
    expect(db._txUpdates[0]).toHaveProperty('role', 'Player');
    expect(db._outerUpdates).toHaveLength(0);
  });

  it('FIRST tx statement is the living-admin FOR UPDATE lock (ORDER BY id)', async () => {
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

  it('count<=1 throws INSIDE the tx: 400 with zero writes anywhere', async () => {
    const db = makeDb(1);
    const svc = await makeService(db);
    await expect(
      svc.update('admin-2', { role: 'Player' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db._txUpdates).toHaveLength(0);
    expect(db._outerUpdates).toHaveLength(0);
  });

  it('non-admin targets keep the plain path: no tx, outer update only', async () => {
    const db = makeDb(2);
    const svc = await makeService(db, 'Player');
    await svc.update('admin-2', { banned: true } as never, 'admin-1');
    expect(db._statements.some((s) => s.kind === 'raw')).toBe(false);
    expect(db._statements.some((s) => s.kind === 'count')).toBe(false);
    expect(db._outerUpdates).toHaveLength(1);
    expect(db._txUpdates).toHaveLength(0);
  });

  it('NEW suspension of an Admin takes the tx path (v3: suspend-vs-demote residual)', async () => {
    const db = makeDb(2);
    const svc = await makeService(db);
    await svc.update(
      'admin-2',
      { suspendedUntil: '2030-01-01T00:00:00.000Z' } as never,
      'admin-1',
    );
    // Serialized through the lock-holding tx like demote/ban.
    expect(db._statements.some((s) => s.kind === 'raw')).toBe(true);
    expect(db._txUpdates).toHaveLength(1);
    expect(db._outerUpdates).toHaveLength(0);
  });

  it('suspension LIFT of an Admin stays on the plain path (only adds living admins)', async () => {
    const db = makeDb(2);
    const svc = await makeService(db);
    await svc.update('admin-2', { suspendedUntil: null } as never, 'admin-1');
    expect(db._statements.some((s) => s.kind === 'raw')).toBe(false);
    expect(db._outerUpdates).toHaveLength(1);
    expect(db._txUpdates).toHaveLength(0);
  });
});
