import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AdminDisputesService } from './disputes.service';
import { AdminMatchesService } from './matches.service';
import { AdminVenuesService } from './venues.service';
import { AdminReportsService } from './reports.service';
import { AdminUsersService } from './users.service';
import { matches, venues, reports, users } from '../../database/schema';
import { withTimestamp } from '../../common/utils/timestamp';

/**
 * P2-141 (Reviewer A, run #98): admin write-path concurrency hardening.
 *
 * Reviewer A flagged 4 RMW races:
 *   - matches.update() bare WHERE-id UPDATE + unlocked overlap COUNT;
 *   - venues.transferOwnership() plain-read role check;
 *   - reports.resolve() ban in a separate non-tx write;
 *   - reports.reopen() status-predicated UPDATE without a surrounding tx.
 *
 * Fix: P2-139 house pattern (tx + SELECT … FOR UPDATE + status-predicated
 * UPDATE), extended to the transferOwnership role check and to the
 * report-ban pairing via a caller-owned-tx path in users.update().
 */

describe('Admin write-path concurrency (P2-141)', () => {
  const nameOf = (t: unknown) => String((t as never)[Symbol.for('drizzle:Name')] ?? '');

  function updateChain(returningRows: unknown[]) {
    const chain: any = { set: () => chain, where: () => chain, returning: () => returningRows };
    return chain;
  }

  // ── AdminMatchesService.update() ────────────────────────────────────

  function makeMatchesService(opts: {
    updateRows: unknown[];
    overlaps?: number;
    findOne?: jest.Mock;
  }) {
    const tx = {
      execute: jest.fn(async () => [{ c: opts.overlaps ?? 0 }] as never),
      select: jest.fn(() => ({
        from: () => ({
          where: () => ({
            for: () => Promise.resolve([{ id: 'm1', status: 'Open' }]),
          }),
        }),
      })),
      update: jest.fn(() => updateChain(opts.updateRows)),
    };
    const db = {
      // P2-141: update() does a plain pre-read on this.db before opening the tx.
      select: jest.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'm1',
                  status: 'Open',
                  booking_mode: 'self',
                  pitch_id: 'p1',
                  scheduled_at: new Date(Date.now() + 86_400_000),
                  duration_mins: 60,
                },
              ]),
          }),
        }),
      })),
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    const matchesService = {
      findOne: opts.findOne ?? jest.fn(async () => ({ id: 'm1', status: 'Open' })),
    };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const activities = { record: jest.fn(async () => {}) };

    const svc = new AdminMatchesService(
      db as never,
      matchesService as never,
      audit as never,
      realtime as never,
      activities as never,
    );
    return { svc, db, tx, audit, matchesService };
  }

  it('matches.update: all writes + overlap check live inside ONE tx', async () => {
    const { svc, db, tx } = makeMatchesService({ updateRows: [{ id: 'm1' }] });
    await svc.update('m1', { title: 'New title' } as never, 'admin-1');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // locked the row
    expect(tx.select).toHaveBeenCalledTimes(1);
    // overlap COUNT only when schedule changes; this is metadata-only.
    expect(tx.execute).not.toHaveBeenCalled();
    // status-predicated UPDATE on matches
    const matchUpdate = tx.update.mock.calls.find((c) => nameOf((c as unknown[])[0]) === 'matches');
    expect(matchUpdate).toBeDefined();
  });

  it('matches.update: zero rows on status-predicated UPDATE → 409 race-loser', async () => {
    const { svc } = makeMatchesService({ updateRows: [] as unknown[] });
    await expect(svc.update('m1', { title: 'X' } as never, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('matches.update: schedule change runs overlap COUNT inside the locked tx', async () => {
    const { svc, tx } = makeMatchesService({
      updateRows: [{ id: 'm1' }],
      overlaps: 0,
    });
    await svc.update('m1', { scheduled_at: new Date(Date.now() + 86_400_000).toISOString() } as never, 'admin-1');
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalled();
  });

  // ── AdminVenuesService.transferOwnership() ────────────────────────

  function makeVenuesService(opts: {
    updateRows: unknown[];
    lockedVenue?: { id: string; owner_id: string };
    lockedTarget?: { id: string; role: string };
  }) {
    const tx = {
      select: jest.fn((cols: Record<string, unknown>) => ({
        from: () => ({
          where: () => ({
            for: () => {
              // first select is venues (id col), second is users (id, role)
              const isVenue = 'owner_id' in cols;
              return Promise.resolve([
                isVenue
                  ? (opts.lockedVenue ?? { id: 'v1', owner_id: 'owner-1' })
                  : (opts.lockedTarget ?? { id: 'new-owner', role: 'VenueOwner' }),
              ]);
            },
          }),
        }),
      })),
      update: jest.fn(() => updateChain(opts.updateRows)),
    };
    const db = {
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const activities = { record: jest.fn(async () => {}) };

    const svc = new AdminVenuesService(
      db as never,
      audit as never,
      realtime as never,
      activities as never,
    );
    jest.spyOn(svc as never, 'findOne').mockResolvedValue({
      id: 'v1',
      owner_id: 'owner-1',
      owner: null,
      verification: null,
    } as never);
    return { svc, db, tx, audit };
  }

  it('venues.transferOwnership: locks venue + target user, role re-checked inside tx', async () => {
    const { svc, db, tx } = makeVenuesService({ updateRows: [{ id: 'v1' }] });
    await svc.transferOwnership(
      'v1',
      { newOwnerId: 'new-owner' } as never,
      'admin-1',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.select).toHaveBeenCalledTimes(2); // venue lock, then user lock
    const venueUpdate = tx.update.mock.calls.find((c) => nameOf((c as unknown[])[0]) === 'venues');
    expect(venueUpdate).toBeDefined();
  });

  it('venues.transferOwnership: target role demoted between findOne and lock → 400', async () => {
    const { svc } = makeVenuesService({
      updateRows: [{ id: 'v1' }],
      lockedTarget: { id: 'new-owner', role: 'Player' },
    });
    await expect(
      svc.transferOwnership('v1', { newOwnerId: 'new-owner' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('venues.transferOwnership: owner-predicated UPDATE matches 0 rows → 409 race-loser', async () => {
    const { svc } = makeVenuesService({ updateRows: [] as unknown[] });
    await expect(
      svc.transferOwnership('v1', { newOwnerId: 'new-owner' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ── AdminReportsService.resolve() + reopen() ────────────────────────

  function makeReportsService(opts: {
    updateRows: unknown[];
    banSubject?: boolean;
    subjectType?: string;
    adminUsersUpdate?: jest.Mock;
  }) {
    const tx = {
      select: jest.fn(() => ({
        from: () => ({
          where: () => ({
            for: () =>
              Promise.resolve([
                {
                  id: 'r1',
                  status: opts.banSubject ? 'open' : 'resolved',
                },
              ]),
          }),
        }),
      })),
      update: jest.fn(() => updateChain(opts.updateRows)),
    };
    const db = {
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const adminUsers = {
      update:
        opts.adminUsersUpdate ??
        jest.fn(async () => {
          /* ok */
        }),
    };
    const activities = { record: jest.fn(async () => {}) };
    const notifications = { sendPushToUsers: jest.fn(async () => {}) };

    const svc = new AdminReportsService(
      db as never,
      audit as never,
      realtime as never,
      adminUsers as never,
      activities as never,
      notifications as never,
    );
    jest.spyOn(svc as never, 'findOne').mockResolvedValue({
      id: 'r1',
      status: opts.banSubject ? 'open' : 'resolved',
      subject_type: opts.subjectType ?? 'user',
      subject_id: 'u-bad',
      reporter: null,
    } as never);
    return { svc, db, tx, audit, adminUsers };
  }

  it('reports.resolve: status update and banSubject ban share ONE tx', async () => {
    const { svc, db, tx, adminUsers } = makeReportsService({
      updateRows: [{ id: 'r1' }],
      banSubject: true,
    });
    await svc.resolve('r1', { outcome: 'resolved', resolution: 'banned', banSubject: true } as never, 'admin-1');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalled();
    // ban was invoked on the caller's tx (5th arg = tx executor)
    expect(adminUsers.update).toHaveBeenCalledWith(
      'u-bad',
      { banned: true },
      'admin-1',
      undefined,
      tx,
    );
  });

  it('reports.resolve: zero rows on status-predicated UPDATE → 409 before ban', async () => {
    const adminUsersUpdate = jest.fn();
    const { svc, adminUsers } = makeReportsService({
      updateRows: [],
      banSubject: true,
      adminUsersUpdate,
    });
    await expect(
      svc.resolve('r1', { outcome: 'resolved', resolution: 'x', banSubject: true } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    // no moderation side effect when the race is lost
    expect(adminUsers.update).not.toHaveBeenCalled();
  });

  it('reports.resolve: ban failure inside tx rolls the resolution back', async () => {
    const adminUsersUpdate = jest.fn(async () => {
      throw new Error('ban failed');
    });
    const { svc } = makeReportsService({
      updateRows: [{ id: 'r1' }],
      banSubject: true,
      adminUsersUpdate,
    });
    await expect(
      svc.resolve('r1', { outcome: 'resolved', resolution: 'x', banSubject: true } as never, 'admin-1'),
    ).rejects.toThrow('ban failed');
  });

  it('reports.reopen: locked read + status-predicated UPDATE in one tx', async () => {
    const { svc, db, tx } = makeReportsService({ updateRows: [{ id: 'r1' }] });
    await svc.reopen('r1', 'admin-1');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalled();
  });

  it('reports.reopen: zero rows on status-predicated UPDATE → 409 race-loser', async () => {
    const { svc } = makeReportsService({ updateRows: [] });
    await expect(svc.reopen('r1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  // ── AdminUsersService.update() inTx path ──────────────────────────────

  it('users.update: caller-owned tx path writes on the injected tx, not a nested tx', async () => {
    const tx = {
      update: jest.fn(() => updateChain([{ id: 'u-bad' }])),
      select: jest.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: 'u-bad', role: 'Player' }]),
          }),
        }),
      })),
      execute: jest.fn(async () => [{ matchesPlayed: 0, totalSpent: '0' }] as never),
    };
    const db = { transaction: jest.fn() }; // should NOT be called
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const activities = { record: jest.fn(async () => {}) };
    const gateway = { disconnectUser: jest.fn() };

    const svc = new AdminUsersService(
      db as never,
      audit as never,
      realtime as never,
      activities as never,
      gateway as never,
    );
    jest.spyOn(svc as never, 'findOne').mockResolvedValue({
      id: 'u-bad',
      deleted_at: null,
      role: 'Player',
      banned_at: null,
      suspended_until: null,
    } as never);

    await svc.update('u-bad', { banned: true } as never, 'admin-1', undefined, tx as never);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.update' }), tx);
  });
});

// ── P2-191 (Reviewer A, run #129): status-predicated edit guards ────────────
//
// disputes.update() and reports.update() used to write decision/note/resolution
// with WHERE id only, outside any tx. A concurrent resolve()/reopen() between
// the findOne read and the write was silently clobbered (and the audit
// before/after pair mis-recorded it). The fix: the UPDATE itself carries
// `AND status = <status findOne saw>` + `.returning({id})`; zero rows → 409.
// ANY-status editing stays allowed — the guard is on concurrency, not on
// which statuses may be edited.

describe('Admin edit-path race guards (P2-191)', () => {
  function predicatedUpdateChain(returningRows: unknown[]) {
    let capturedWhere: unknown;
    const chain: any = {
      set: () => chain,
      where: (w: unknown) => {
        capturedWhere = w;
        return chain;
      },
      returning: () => returningRows,
      _capturedWhere: () => capturedWhere,
    };
    return chain;
  }

  const dialect = new PgDialect();

  /** Render the drizzle where-expression to SQL text and require the `status`
   * column to appear (PR-Agent run #129 MINOR: without this, reverting the fix
   * to a bare `.where(eq(id))` would still pass every mocked 409 test. SQL
   * rendering is used instead of node-walking because drizzle column objects
   * carry a `.table` back-reference whose column bag includes `status`, which
   * makes any structural walk vacuously true.) */
  function renderedWhereHasStatusPredicate(node: unknown): boolean {
    try {
      const { sql } = dialect.sqlToQuery(node as never);
      return /"disputes"\."status"|"reports"\."status"|(?<![a-z_])status(?![a-z_])/.test(sql);
    } catch {
      return false;
    }
  }

  function makeDisputesService(opts: { updateRows: unknown[]; findOne?: jest.Mock }) {
    const update = jest.fn(() => predicatedUpdateChain(opts.updateRows));
    const db = { update };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const activities = { record: jest.fn(async () => {}) };
    const svc = new AdminDisputesService(
      db as never,
      audit as never,
      realtime as never,
      activities as never,
    );
    jest
      .spyOn(svc as never, 'findOne')
      .mockResolvedValue({ id: 'd1', status: 'under_review' } as never);
    return { svc, db, audit, realtime };
  }

  it('disputes.update: fires the guarded UPDATE and returns the fresh aggregate on success', async () => {
    const { svc, db, audit } = makeDisputesService({ updateRows: [{ id: 'd1' }] });
    const after = await svc.update('d1', { decision: 'upheld' } as never, 'admin-1');
    expect(db.update).toHaveBeenCalledTimes(1);
    // The write must actually carry the status predicate (anti-regression).
    const chain = (db.update as jest.Mock).mock.results[0].value;
    expect(renderedWhereHasStatusPredicate(chain._capturedWhere())).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dispute.update', entityId: 'd1' }),
    );
    expect(after).toMatchObject({ id: 'd1', status: 'under_review' });
  });

  it('disputes.update: status drift between read and write → 409, no audit write', async () => {
    const { svc, audit } = makeDisputesService({ updateRows: [] });
    await expect(
      svc.update('d1', { internalNote: 'note' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('disputes.update: still rejects a no-op payload before any write', async () => {
    const { svc, db } = makeDisputesService({ updateRows: [{ id: 'd1' }] });
    await expect(
      svc.update('d1', {} as never, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('reports.update: zero rows on status-predicated UPDATE → 409 before audit', async () => {
    // Reuse the reports harness: update() path does NOT use tx — patch db.update directly.
    const update = jest.fn(() => predicatedUpdateChain([]));
    const db = { update, transaction: jest.fn() };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const svc = new AdminReportsService(
      db as never,
      audit as never,
      realtime as never,
      { update: jest.fn() } as never,
      { record: jest.fn() } as never,
      { sendPushToUsers: jest.fn() } as never,
    );
    jest
      .spyOn(svc as never, 'findOne')
      .mockResolvedValue({ id: 'r1', status: 'open', subject_type: 'user', subject_id: 'u1' } as never);

    await expect(
      svc.update('r1', { resolution: 'x' } as never, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled(); // single-statement guard, no tx
  });

  it('reports.update: fires the guarded UPDATE and audits on success', async () => {
    const update = jest.fn(() => predicatedUpdateChain([{ id: 'r1' }]));
    const db = { update, transaction: jest.fn() };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const svc = new AdminReportsService(
      db as never,
      audit as never,
      realtime as never,
      { update: jest.fn() } as never,
      { record: jest.fn() } as never,
      { sendPushToUsers: jest.fn() } as never,
    );
    jest
      .spyOn(svc as never, 'findOne')
      .mockResolvedValue({ id: 'r1', status: 'open', subject_type: 'user', subject_id: 'u1' } as never);

    await svc.update('r1', { resolution: 'warned' } as never, 'admin-1');
    expect(db.update).toHaveBeenCalledTimes(1);
    // The write must actually carry the status predicate (anti-regression).
    const chain = (update as jest.Mock).mock.results[0].value;
    expect(renderedWhereHasStatusPredicate(chain._capturedWhere())).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'report.update', entityId: 'r1' }),
    );
  });
});
