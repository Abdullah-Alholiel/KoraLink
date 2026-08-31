import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import { transactions, users } from '../../database/schema';
import { AdminTransactionsService } from './transactions.service';

/**
 * AdminTransactionsService.refund specs (run #22, Reviewer A finding).
 * The pre-check runs OUTSIDE any lock, so two concurrent refunds of the same
 * completed debit could both pass it. The tx must lock the original row
 * FOR UPDATE, re-assert status INSIDE the tx, and treat a lost
 * refund-<id> idempotency race as a clean 400 — never a raw 500, never a
 * double credit.
 */
describe('AdminTransactionsService.refund', () => {
  const DEBIT = {
    id: 'debit-1',
    user_id: 'user-1',
    type: 'DEBIT',
    status: 'Completed',
    amount: '250',
  };
  function makeHarness(overrides: {
    original?: Record<string, unknown> | null;
    lockedRows?: Array<Record<string, unknown>>;
    conflict?: boolean;
  }) {
    const original =
      overrides.original === undefined ? DEBIT : overrides.original;
    const lockedRows = overrides.lockedRows ?? [
      { id: DEBIT.id, status: 'Completed' },
    ];
    const conflict = overrides.conflict ?? false;

    const insertedTransactions: Array<Record<string, unknown>> = [];
    const reversedUpdates: Array<Record<string, unknown>> = [];
    const walletUpdates: Array<Record<string, unknown>> = [];
    const auditEvents: Array<Record<string, unknown>> = [];
    let txStarted = false;

    const tx = {
      execute: async (query: unknown) => {
        const q = new PgDialect().sqlToQuery(query as never).sql;
        if (q.includes('FROM transactions')) return { rows: lockedRows };
        return { rows: [] };
      },
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          if (table === transactions) insertedTransactions.push(v);
          return {
            onConflictDoNothing: () => ({
              returning: () => ({
                then: (resolve: (v: unknown) => void) =>
                  resolve(conflict ? [] : [{ id: v.id }]),
              }),
            }),
          };
        },
      }),
      update: (table: unknown) => ({
        set: (setArg: Record<string, unknown>) => ({
          where: () => {
            if (table === transactions) reversedUpdates.push(setArg);
            if (table === users) walletUpdates.push(setArg);
            return { then: (r: (v: unknown) => void) => r([]) };
          },
        }),
      }),
    };

    const makeDb = () => ({
      transaction: async (cb: (t: unknown) => Promise<unknown>) => {
        txStarted = true;
        return cb(tx);
      },
      query: {
        transactions: {
          // findOne pops: 1st call = original debit, 2nd = created refund.
          findFirst: async () =>
            original === null ? null : (original as never),
        },
      },
    });

    const audit = { log: async (e: Record<string, unknown>) => { auditEvents.push(e); } };
    const realtime = { broadcastOps: () => {} };
    const activities = { record: async () => {} };

    const makeService = () =>
      new AdminTransactionsService(
        makeDb() as never,
        audit as never,
        realtime as never,
        activities as never,
      );

    return {
      makeService,
      insertedTransactions,
      reversedUpdates,
      walletUpdates,
      auditEvents,
      isTxStarted: () => txStarted,
    };
  }

  it('happy path: idempotent-key credit, Reversed, wallet credit, audit', async () => {
    const h = makeHarness({});
    const result = await h.makeService().refund(DEBIT.id, 'admin-1', '10.0.0.1');

    expect(result).toBeDefined();
    expect(h.insertedTransactions).toHaveLength(1);
    expect(h.insertedTransactions[0]).toMatchObject({
      id: expect.any(String),
      user_id: DEBIT.user_id,
      type: 'CREDIT',
      amount: DEBIT.amount,
      reference_type: 'REFUND',
      reference_id: DEBIT.id,
      idempotency_key: `refund-${DEBIT.id}`,
      status: 'Completed',
    });
    expect(h.reversedUpdates).toHaveLength(1);
    expect(h.walletUpdates).toHaveLength(1);
    expect(h.auditEvents).toHaveLength(1);
    expect(h.auditEvents[0]).toMatchObject({
      action: 'transaction.refund',
      entityId: DEBIT.id,
    });
  });

  it('row vanishes or status flips before the lock → 400, ZERO side effects', async () => {
    const h = makeHarness({ lockedRows: [] });
    await expect(
      h.makeService().refund(DEBIT.id, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.insertedTransactions).toHaveLength(0);
    expect(h.reversedUpdates).toHaveLength(0);
    expect(h.walletUpdates).toHaveLength(0);
  });

  it('status re-checked INSIDE the tx (already Reversed) → 400, no credit', async () => {
    const h = makeHarness({
      lockedRows: [{ id: DEBIT.id, status: 'Reversed' }],
    });
    await expect(
      h.makeService().refund(DEBIT.id, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.insertedTransactions).toHaveLength(0);
    expect(h.reversedUpdates).toHaveLength(0);
    expect(h.walletUpdates).toHaveLength(0);
  });

  it('concurrent loser (refund-<id> already claimed) → 400, no Reversed, no wallet credit', async () => {
    const h = makeHarness({ conflict: true });
    await expect(
      h.makeService().refund(DEBIT.id, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    // The insert attempted exactly once (the loser), but nothing else ran.
    expect(h.insertedTransactions).toHaveLength(1);
    expect(h.reversedUpdates).toHaveLength(0);
    expect(h.walletUpdates).toHaveLength(0);
    expect(h.auditEvents).toHaveLength(0);
  });

  it('pre-check: non-DEBIT → 400 before any tx opens', async () => {
    const h = makeHarness({ original: { ...DEBIT, type: 'CREDIT' } });
    await expect(
      h.makeService().refund(DEBIT.id, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.isTxStarted()).toBe(false);
  });

  it('pre-check: not Completed → 400 before any tx opens', async () => {
    const h = makeHarness({ original: { ...DEBIT, status: 'Pending' } });
    await expect(
      h.makeService().refund(DEBIT.id, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.isTxStarted()).toBe(false);
  });

  it('findOne null (unknown id) → NotFound from findOne, no tx', async () => {
    const h = makeHarness({ original: null });
    await expect(
      h.makeService().refund('missing', 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.insertedTransactions).toHaveLength(0);
  });
});
