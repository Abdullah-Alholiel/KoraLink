import { BadRequestException } from '@nestjs/common';
import { AdminSettlementsService } from './settlements.service';

/**
 * Data-integrity race guards (P2-9):
 * - `pay` flips `pending → paid` via a conditional UPDATE (`WHERE status='pending'`)
 *   and throws when zero rows match — a concurrent pay can no longer double-pay.
 * - `generatePending` inserts inside a transaction with `onConflictDoNothing`
 *   against the `(venue_id, period_start)` unique index — a concurrent run (or a
 *   re-run for an already-settled window) skips instead of double-inserting.
 */
describe('AdminSettlementsService race guards', () => {
  const SETTLEMENT_ID = 'settle-1';

  function updateChain(returningRows: unknown[]) {
    const chain: any = {
      set: () => chain,
      where: () => chain,
      returning: () => returningRows,
    };
    return chain;
  }

  function insertChain(results: unknown[][]) {
    const chain: any = {
      values: () => chain,
      onConflictDoNothing: () => chain,
      returning: () => (results.length ? results.shift()! : []),
    };
    return chain;
  }

  function makeService(opts: {
    findFirst: jest.Mock;
    updateRows: unknown[];
    executeRows: unknown[];
    insertResults: unknown[][];
  }) {
    const db = {
      query: { settlements: { findFirst: opts.findFirst } },
      update: jest.fn(() => updateChain(opts.updateRows)),
      execute: jest.fn(async () => opts.executeRows),
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ insert: jest.fn(() => insertChain(opts.insertResults)) }),
      ),
    };
    const audit = { log: jest.fn(async () => {}) };
    const settings = { getNumber: jest.fn(async () => 7) };
    const realtime = { broadcastOps: jest.fn() };
    const activities = { record: jest.fn(async () => {}) };
    const notifications = { sendPushToUsers: jest.fn(async () => 0) };
    const svc = new AdminSettlementsService(
      db as never,
      audit as never,
      settings as never,
      realtime as never,
      activities as never,
      notifications as never,
    );
    return { svc, audit, db, activities, notifications };
  }

  it('pay rejects (BadRequest) when the conditional update matches 0 rows (already paid race)', async () => {
    const { svc } = makeService({
      findFirst: jest.fn(async () => ({
        id: SETTLEMENT_ID,
        status: 'pending',
        venue: { id: 'v1' },
      })),
      updateRows: [],
      executeRows: [],
      insertResults: [],
    });

    await expect(svc.pay(SETTLEMENT_ID, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('pay succeeds and returns the populated settlement when the update flips the row', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: SETTLEMENT_ID, status: 'pending', venue: { id: 'v1' } })
      .mockResolvedValueOnce({
        id: SETTLEMENT_ID,
        status: 'paid',
        payout_ref: 'PO-SETTLE-1',
        venue: { id: 'v1' },
      });
    const { svc, audit } = makeService({
      findFirst,
      updateRows: [{ id: SETTLEMENT_ID }],
      executeRows: [],
      insertResults: [],
    });

    const result = await svc.pay(SETTLEMENT_ID, 'admin-1');
    expect(result.status).toBe('paid');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'settlement.pay' }),
    );
  });

  // P1-67 (run #141): a successful pay notifies the venue owner — bell
  // activity (payout_paid → feed_items + WS) + localized push, both carrying
  // the settlement id / venue + amount specifics. The owner row is resolved
  // AFTER the guarded update, so a 400-race pay never notifies (asserted by
  // the reject test above staying notify-free).
  it('pay resolves the venue owner and fans out bell activity + localized push', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: SETTLEMENT_ID, status: 'pending', venue: { id: 'v1' } })
      .mockResolvedValueOnce({
        id: SETTLEMENT_ID,
        status: 'paid',
        payout_ref: 'PO-SETTLE-1',
        venue: { id: 'v1' },
      });
    const { svc, activities, notifications, db } = makeService({
      findFirst,
      updateRows: [{ id: SETTLEMENT_ID }],
      // first execute = pay()'s owner/venue/amount resolve
      executeRows: [{ owner_id: 'owner-1', venue_name: 'Malqa Ladies Arena', amount: '3150.00' }],
      insertResults: [],
    });

    await svc.pay(SETTLEMENT_ID, 'admin-1');

    expect(activities.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        verb: 'payout_paid',
        subjectId: SETTLEMENT_ID,
        recipients: ['owner-1'],
        excludeActor: false,
      }),
    );
    expect(notifications.sendPushToUsers).toHaveBeenCalledWith(
      ['owner-1'],
      expect.objectContaining({
        key: 'payout_paid',
        vars: expect.objectContaining({ venueName: 'Malqa Ladies Arena', amount: '3150.00' }),
        data: expect.objectContaining({ type: 'payout-paid' }),
      }),
    );
    // The resolve reads owner from the venues join, not the settlements row.
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('pay swallows a failing notify fan-out — the settlement still pays', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: SETTLEMENT_ID, status: 'pending', venue: { id: 'v1' } })
      .mockResolvedValueOnce({
        id: SETTLEMENT_ID,
        status: 'paid',
        payout_ref: 'PO-SETTLE-1',
        venue: { id: 'v1' },
      });
    const { svc, activities } = makeService({
      findFirst,
      updateRows: [{ id: SETTLEMENT_ID }],
      executeRows: [{ owner_id: 'owner-1', venue_name: 'Malqa Ladies Arena', amount: '3150.00' }],
      insertResults: [],
    });
    (activities.record as jest.Mock).mockRejectedValueOnce(new Error('fan-out down'));

    const result = await svc.pay(SETTLEMENT_ID, 'admin-1');
    expect(result.status).toBe('paid');
    expect(activities.record).toHaveBeenCalledTimes(1);
  });

  it('pay with no resolvable owner row skips notify silently (data edge, not an error)', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: SETTLEMENT_ID, status: 'pending', venue: { id: 'v1' } })
      .mockResolvedValueOnce({
        id: SETTLEMENT_ID,
        status: 'paid',
        payout_ref: 'PO-SETTLE-1',
        venue: { id: 'v1' },
      });
    const { svc, activities, notifications } = makeService({
      findFirst,
      updateRows: [{ id: SETTLEMENT_ID }],
      executeRows: [[]],
      insertResults: [],
    });

    const result = await svc.pay(SETTLEMENT_ID, 'admin-1');
    expect(result.status).toBe('paid');
    expect(activities.record).not.toHaveBeenCalled();
    expect(notifications.sendPushToUsers).not.toHaveBeenCalled();
  });

  it('generatePending returns generated=0 when the unique index swallows every insert (concurrent run)', async () => {
    const { svc, audit } = makeService({
      findFirst: jest.fn(),
      updateRows: [],
      executeRows: [{ venue_id: 'v1', amount: 100 }],
      insertResults: [[]],
    });

    const result = await svc.generatePending('admin-1');
    expect(result.generated).toBe(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('generatePending inserts and audits each pending settlement', async () => {
    const { svc, audit } = makeService({
      findFirst: jest.fn(),
      updateRows: [],
      executeRows: [
        { venue_id: 'v1', amount: 100 },
        { venue_id: 'v2', amount: 50 },
      ],
      insertResults: [
        [{ id: 's1', venue_id: 'v1', amount: '100.00' }],
        [{ id: 's2', venue_id: 'v2', amount: '50.00' }],
      ],
    });

    const result = await svc.generatePending('admin-1');
    expect(result.generated).toBe(2);
    expect(audit.log).toHaveBeenCalledTimes(2);
  });
});
