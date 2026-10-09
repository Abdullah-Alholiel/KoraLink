import { BadRequestException } from '@nestjs/common';
import { AdminUsersService } from './users.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { BulkModerateUsersDto } from './dto/bulk-moderate.dto';

/**
 * P2-107 (run #116): bulk moderation partial-success contract.
 *
 * The bulk path loops the SAME guarded update() the drawer uses, so each row
 * can individually fail (self-moderation, last-admin lock, PDPL ghost 409,
 * vanished row 404) without aborting the batch. These tests pin:
 *   1. success path returns updated/requested counts + empty skipped;
 *   2. per-row failures are ISOLATED into skipped (loop continues);
 *   3. the whole batch 400s when it includes the caller's own id;
 *   4. ONE batch audit entry lands per action (admin_bulk_ban/admin_bulk_suspend);
 *   5. suspend maps to the 7-day default (same as the drawer action).
 */
describe('AdminUsersService bulkModerate (P2-107)', () => {
  const ADMIN = 'admin-1';
  const A = 'user-a';
  const B = 'user-b';
  const C = 'user-c';

  function makeService(opts: {
    updateBehavior: (id: string, dto: { banned?: boolean; suspendedUntil?: string }) => Promise<unknown>;
  }) {
    const auditEntries: Array<Record<string, unknown>> = [];
    const svc = new (AdminUsersService as new (...args: unknown[]) => AdminUsersService & {
      update: (id: string, dto: Record<string, unknown>, adminId: string, ip?: string) => Promise<unknown>;
    })(
      {} as never, // db — bulkModerate touches it only through update()
      { sign: () => 'x' } as unknown as JwtService,
      { get: (_k: string, d?: string) => d } as unknown as ConfigService,
    );
    // Replace update() wholesale — the contract under test is the LOOP, not
    // update()'s internals (those have their own suites).
    (svc as unknown as { update: jest.Mock }).update = jest.fn(
      (id: string, dto: Record<string, unknown>) => opts.updateBehavior(id, dto as never),
    );
    (svc as unknown as { audit: { log: jest.Mock } }).audit = {
      log: jest.fn(async (e: Record<string, unknown>) => {
        auditEntries.push(e);
      }),
    };
    (svc as unknown as { realtime: { broadcastOps: jest.Mock } }).realtime = {
      broadcastOps: jest.fn(),
    };
    return { svc, auditEntries, updateMock: (svc as unknown as { update: jest.Mock }).update };
  }

  it('returns updated/requested with empty skipped when every row applies', async () => {
    const { svc, auditEntries } = makeService({ updateBehavior: async () => ({}) });
    const dto: BulkModerateUsersDto = { action: 'ban', ids: [A, B] };
    const res = await svc.bulkModerate(dto, ADMIN, '10.0.0.1');
    expect(res).toEqual({ action: 'ban', requested: 2, updated: 2, skipped: [] });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      adminId: ADMIN,
      action: 'admin_bulk_ban',
      entityType: 'user',
      entityId: null,
      ip: '10.0.0.1',
    });
    expect(auditEntries[0].after).toEqual({ ids: [A, B], updated: [A, B], skipped: [] });
  });

  it('isolates per-row failures into skipped and keeps applying the rest', async () => {
    const { svc } = makeService({
      updateBehavior: async (id) => {
        if (id === B) throw new BadRequestException('Cannot demote or ban the last active admin account.');
        if (id === C) throw new BadRequestException('This account is deleted (PDPL); moderation actions are disabled.');
        return {};
      },
    });
    const res = await svc.bulkModerate({ action: 'ban', ids: [A, B, C] }, ADMIN);
    expect(res.requested).toBe(3);
    expect(res.updated).toBe(1);
    expect(res.skipped).toEqual([
      { id: B, reason: 'Cannot demote or ban the last active admin account.' },
      { id: C, reason: 'This account is deleted (PDPL); moderation actions are disabled.' },
    ]);
  });

  it('rejects a batch containing the caller with 400 before any write', async () => {
    const { svc, updateMock } = makeService({ updateBehavior: async () => ({}) });
    await expect(
      svc.bulkModerate({ action: 'ban', ids: [A, ADMIN] }, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('maps suspend to a 7-day future ISO default', async () => {
    const { svc, updateMock } = makeService({ updateBehavior: async () => ({}) });
    await svc.bulkModerate({ action: 'suspend', ids: [A] }, ADMIN);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, dto] = updateMock.mock.calls[0] as [string, { suspendedUntil: string }];
    const until = new Date(dto.suspendedUntil).getTime();
    expect(until).toBeGreaterThan(Date.now());
    const days = (until - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('writes admin_bulk_suspend action on the suspend batch', async () => {
    const { svc, auditEntries } = makeService({ updateBehavior: async () => ({}) });
    await svc.bulkModerate({ action: 'suspend', ids: [A, B] }, ADMIN);
    expect(auditEntries[0].action).toBe('admin_bulk_suspend');
  });

  it('rethrows non-guard (infrastructure) errors instead of masking them as skipped', async () => {
    const { svc, auditEntries } = makeService({
      updateBehavior: async (id) => {
        if (id === B) throw new Error('db connection terminated'); // NOT a guard HttpException
        return {};
      },
    });
    await expect(
      svc.bulkModerate({ action: 'ban', ids: [A, B, C] }, ADMIN),
    ).rejects.toThrow('db connection terminated');
    // No batch audit entry: the batch did not complete; applied rows keep
    // their per-row user.update entries from update() for reconciliation.
    expect(auditEntries).toHaveLength(0);
  });
});
