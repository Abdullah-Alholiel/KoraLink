import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
