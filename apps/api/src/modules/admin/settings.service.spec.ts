import { BadRequestException } from '@nestjs/common';
import { AdminSettingsService } from './settings.service';

/**
 * P2-115 — admin platform-settings PUT hardening.
 *
 * set() previously upserted ANY key with ANY JSON value and wrote no audit
 * row — the only mutating admin surface without a trail. It now enforces the
 * KNOWN_SETTINGS registry (key allowlist + type/bounds), reads the old value
 * and upserts in ONE tx, then logs `settings.update` with before/after.
 */
describe('AdminSettingsService.set — P2-115', () => {
  const ADMIN_ID = 'admin-1';
  const IP = '10.0.0.1';

  function makeService(existing?: { value: unknown }) {
    const upserts: unknown[] = [];
    const selectChain: any = {
      from: () => selectChain,
      where: () => selectChain,
      for: jest.fn(async () => (existing ? [existing] : [])),
    };
    const tx = {
      select: jest.fn(() => selectChain),
      insert: jest.fn(() => ({
        values: (v: unknown) => ({
          onConflictDoUpdate: jest.fn(async () => {
            upserts.push(v);
          }),
        }),
      })),
    };
    const db = {
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    const platformSettings = { invalidate: jest.fn() };
    const realtime = { broadcastOps: jest.fn() };
    const audit = { log: jest.fn(async () => {}) };
    const svc = new AdminSettingsService(
      db as never,
      platformSettings as never,
      realtime as never,
      audit as never,
    );
    return { svc, db, tx, platformSettings, realtime, audit, upserts };
  }

  async function expect400(p: Promise<unknown>): Promise<BadRequestException> {
    const err = await p.then(
      () => {
        throw new Error('expected BadRequestException');
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BadRequestException);
    return err as BadRequestException;
  }

  it('rejects an unknown key with a message listing the valid keys', async () => {
    const { svc, db, audit } = makeService();
    const err = await expect400(svc.set('bogus_key', 1, ADMIN_ID, IP));
    expect(err.message).toContain('platform_margin_sar');
    expect(err.message).toContain('grace_period_mins');
    expect(err.message).toContain('payout_cadence_days');
    expect(err.message).toContain('refund_policy');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('rejects a string for a number setting', async () => {
    const { svc, db } = makeService();
    await expect400(svc.set('platform_margin_sar', '5', ADMIN_ID, IP));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects null / boolean / NaN for a number setting', async () => {
    const { svc } = makeService();
    await expect400(svc.set('grace_period_mins', null, ADMIN_ID, IP));
    await expect400(svc.set('grace_period_mins', true, ADMIN_ID, IP));
    await expect400(svc.set('grace_period_mins', Number.NaN, ADMIN_ID, IP));
  });

  it('rejects payout_cadence_days = 0 (below min 1)', async () => {
    const { svc, db } = makeService();
    await expect400(svc.set('payout_cadence_days', 0, ADMIN_ID, IP));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects refund_policy longer than 10000 chars', async () => {
    const { svc, db } = makeService();
    await expect400(svc.set('refund_policy', 'x'.repeat(10001), ADMIN_ID, IP));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('happy path: upserts in a tx, audits before/after once, propagates', async () => {
    const { svc, db, platformSettings, realtime, audit, upserts } = makeService({ value: 10 });

    const res = await svc.set('platform_margin_sar', 12.5, ADMIN_ID, IP);

    expect(res).toEqual({ key: 'platform_margin_sar', value: 12.5 });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(upserts).toEqual([{ key: 'platform_margin_sar', value: 12.5 }]);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith({
      adminId: ADMIN_ID,
      action: 'settings.update',
      entityType: 'setting',
      entityId: 'platform_margin_sar',
      before: 10,
      after: 12.5,
      ip: IP,
    });
    expect(platformSettings.invalidate).toHaveBeenCalledTimes(1);
    expect(realtime.broadcastOps).toHaveBeenCalledWith('settings');
  });

  it('first write of a key audits before = null', async () => {
    const { svc, audit } = makeService();
    await svc.set('refund_policy', 'No refunds within 2h of kickoff.', ADMIN_ID, IP);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        before: null,
        after: 'No refunds within 2h of kickoff.',
        entityId: 'refund_policy',
      }),
    );
  });
});
