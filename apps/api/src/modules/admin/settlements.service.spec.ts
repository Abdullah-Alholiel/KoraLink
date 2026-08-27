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
    const svc = new AdminSettlementsService(
      db as never,
      audit as never,
      settings as never,
      realtime as never,
    );
    return { svc, audit };
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
