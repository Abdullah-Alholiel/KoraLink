import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { AdminMatchesService } from './matches.service';
import { AdminVenuesService } from './venues.service';
import { AdminReportsService } from './reports.service';

/**
 * P2-141 (run #98): admin write-path concurrency hardening.
 *
 * - matches.update(): lock → validate → overlap → status-predicated UPDATE in
 *   ONE tx; zero rows → 409, missing locked row → 404.
 * - venues.transferOwnership(): venue + target user locked in ONE tx; the role
 *   check runs against the LOCKED user row.
 * - reports.resolve(): a ban failure reverts the report flip (status-predicated)
 *   and surfaces a 409; the existing zero-rows 409 on the flip is unchanged.
 *
 * Mock DB/tx chains mirror disputes.service.spec.ts; `findOne` is spied.
 */
describe('Admin write-path concurrency (P2-141)', () => {
  const dialect = new PgDialect();
  const render = (where: unknown) => dialect.sqlToQuery(where as SQL);
  type Chain = Record<string, (...args: never[]) => unknown>;

  /** select().from().where().limit().for() → resolves the next queued row set. */
  function selectQueue(queue: unknown[][]) {
    return jest.fn(() => {
      const rows = queue.shift() ?? [];
      const chain: Chain = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        for: jest.fn(async () => rows),
      };
      return chain;
    });
  }

  /** update().set().where() — awaitable directly or via .returning(). */
  function updateChain(returningRows: unknown[], wheres: unknown[]) {
    const chain: Chain = {
      set: () => chain,
      where: (w: unknown) => {
        wheres.push(w);
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => returningRows,
        });
      },
    };
    return chain;
  }

  // ── matches.update ───────────────────────────────────────────────────

  function makeMatches(opts: { locked: unknown[]; updatedRows: unknown[] }) {
    const wheres: unknown[] = [];
    const tx = {
      select: selectQueue([opts.locked]),
      execute: jest.fn(async () => [{ c: 0 }]),
      update: jest.fn(() => updateChain(opts.updatedRows, wheres)),
    };
    const db = {
      update: jest.fn(),
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const svc = new AdminMatchesService(
      db as never,
      {} as never,
      audit as never,
      realtime as never,
      {} as never,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'm1' } as never);
    return { svc, db, tx, audit, wheres };
  }

  const openRow = {
    id: 'm1',
    status: 'Open',
    booking_mode: 'self',
    pitch_id: 'p1',
    scheduled_at: new Date(Date.now() + 86_400_000),
    duration_mins: 60,
  };

  it('matches.update: 409 when the status-predicated UPDATE affects zero rows', async () => {
    const { svc, audit } = makeMatches({ locked: [openRow], updatedRows: [] });
    await expect(svc.update('m1', { title: 'x' } as never, 'admin1')).rejects.toThrow(
      ConflictException,
    );
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('matches.update: 404 when the locked row is missing', async () => {
    const { svc, tx } = makeMatches({ locked: [], updatedRows: [] });
    await expect(svc.update('m1', { title: 'x' } as never, 'admin1')).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('matches.update: locks, checks overlap and UPDATEs with an inArray status predicate inside ONE tx', async () => {
    const { svc, db, tx, audit, wheres } = makeMatches({
      locked: [openRow],
      updatedRows: [{ id: 'm1' }],
    });
    await svc.update('m1', { duration_mins: 90 } as never, 'admin1');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith('update');
    expect(tx.execute).toHaveBeenCalledTimes(2); // advisory lock + overlap COUNT run in-tx
    const firstCall = (tx.execute as jest.Mock).mock.calls[0] as unknown[];
    expect(render(firstCall[0] as SQL<unknown>).sql).toMatch(/pg_advisory_xact_lock/);
    expect(db.update).not.toHaveBeenCalled(); // no standalone write left

    expect(wheres).toHaveLength(1);
    const q = render(wheres[0]);
    expect(q.sql).toMatch(/"id" = \$1 and "matches"\."status" in \(\$2, \$3\)/);
    expect(q.params).toEqual(['m1', 'Open', 'InProgress']);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('matches.update: metadata-only edits do NOT take the pitch advisory lock', async () => {
    const { svc, db, tx } = makeMatches({
      locked: [openRow],
      updatedRows: [{ id: 'm1' }],
    });
    await svc.update('m1', { title: 'New title' } as never, 'admin1');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).not.toHaveBeenCalled();
  });

  // ── venues.transferOwnership ─────────────────────────────────────────

  function makeVenues(opts: { venue: unknown[]; target: unknown[] }) {
    const wheres: unknown[] = [];
    const tx = {
      select: selectQueue([opts.venue, opts.target]),
      update: jest.fn(() => updateChain([], wheres)),
    };
    const db = {
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    const audit = { log: jest.fn(async () => {}) };
    const svc = new AdminVenuesService(
      db as never,
      audit as never,
      { broadcastOps: jest.fn() } as never,
      { record: jest.fn(async () => {}) } as never,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 'v1', owner_id: 'old' } as never);
    return { svc, tx, audit };
  }

  it('venues.transferOwnership: 400 when the LOCKED target user is not a VenueOwner', async () => {
    const { svc, tx, audit } = makeVenues({
      venue: [{ id: 'v1', owner_id: 'old' }],
      target: [{ id: 'u2', role: 'Player' }],
    });
    await expect(
      svc.transferOwnership('v1', { newOwnerId: 'u2' } as never, 'admin1'),
    ).rejects.toThrow(new BadRequestException('Target user is not a venue owner.'));
    // both reads took row locks; no owner_id write happened
    expect(tx.select).toHaveBeenCalledTimes(2);
    for (const r of tx.select.mock.results) {
      expect(r.value.for).toHaveBeenCalledWith('update');
    }
    expect(tx.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('venues.transferOwnership: 400 when the LOCKED target user is banned', async () => {
    const { svc, tx } = makeVenues({
      venue: [{ id: 'v1', owner_id: 'old' }],
      target: [{ id: 'u2', role: 'VenueOwner', banned_at: new Date().toISOString() }],
    });
    await expect(
      svc.transferOwnership('v1', { newOwnerId: 'u2' } as never, 'admin1'),
    ).rejects.toThrow(
      new BadRequestException('Target user is banned and cannot receive venue ownership.'),
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  // ── reports.resolve ──────────────────────────────────────────────────

  function makeReports(opts: { flipRows: unknown[]; revertRows: unknown[]; banFails: 'validation' | 'infra' | false }) {
    const wheres: unknown[] = [];
    const sets: unknown[] = [];
    const db = {
      update: jest.fn(() => {
        const rows = wheres.length === 0 ? opts.flipRows : opts.revertRows;
        const chain = updateChain(rows, wheres);
        chain.set = (v: unknown) => {
          sets.push(v);
          return chain;
        };
        return chain;
      }),
    };
    const audit = { log: jest.fn(async () => {}) };
    const adminUsers = {
      update: jest.fn(async () => {
        if (opts.banFails === 'validation') throw new ConflictException('ban failed');
        if (opts.banFails === 'infra') throw new Error('DB timeout');
      }),
    };
    const svc = new AdminReportsService(
      db as never,
      audit as never,
      { broadcastOps: jest.fn() } as never,
      adminUsers as never,
      { record: jest.fn(async () => {}) } as never,
      { sendPushToUsers: jest.fn(async () => {}) } as never,
    );
    jest.spyOn(svc, 'findOne').mockResolvedValue({
      id: 'r1',
      status: 'open',
      resolution: null,
      subject_type: 'user',
      subject_id: 'u9',
      reporter: null,
    } as never);
    return { svc, db, audit, adminUsers, wheres, sets };
  }

  it('reports.resolve: ban failure reverts the report (status-predicated) and throws 409', async () => {
    const { svc, db, audit, wheres, sets } = makeReports({
      flipRows: [{ id: 'r1' }],
      revertRows: [{ id: 'r1' }],
      banFails: 'validation',
    });
    await expect(
      svc.resolve('r1', { outcome: 'resolved', banSubject: true } as never, 'admin1'),
    ).rejects.toThrow(
      new ConflictException('Report resolved but the ban failed — report reverted, retry.'),
    );

    expect(db.update).toHaveBeenCalledTimes(2); // flip + revert
    expect(sets[1]).toMatchObject({ status: 'open', resolved_by: null, resolved_at: null });
    const q = render(wheres[1]);
    expect(q.sql).toMatch(/"reports"."status" in \(\$2\)/);
    expect(q.params).toEqual(['r1', 'resolved']);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'report.resolve_ban_failed_revert', entityId: 'r1' }),
    );
  });

  it('reports.resolve: infra errors from the ban service bubble without a revert', async () => {
    const { svc, db, audit } = makeReports({
      flipRows: [{ id: 'r1' }],
      revertRows: [{ id: 'r1' }],
      banFails: 'infra',
    });
    await expect(
      svc.resolve('r1', { outcome: 'resolved', banSubject: true } as never, 'admin1'),
    ).rejects.toThrow('DB timeout');
    expect(db.update).toHaveBeenCalledTimes(1); // only the flip
    expect(audit.log).not.toHaveBeenCalled(); // resolve audit never runs; no revert audit
  });

  it('reports.resolve: keeps the zero-rows 409 on the status flip (no ban attempted)', async () => {
    const { svc, db, adminUsers } = makeReports({
      flipRows: [],
      revertRows: [{ id: 'r1' }],
      banFails: false,
    });
    await expect(
      svc.resolve('r1', { outcome: 'resolved', banSubject: true } as never, 'admin1'),
    ).rejects.toThrow(
      new ConflictException('Report was concurrently decided — re-check its status.'),
    );
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(adminUsers.update).not.toHaveBeenCalled();
  });
});
