import { BadRequestException } from '@nestjs/common';
import { AdminDisputesService } from './disputes.service';
import { creditWalletTx } from '../matches/match-fees';

/**
 * P1-29 (run #173) — dispute refund side-effect contract:
 *
 * The wallet credit MUST ride the resolve transaction boundary:
 *  - happy path: creditWalletTx called ONCE with the per-dispute idempotency
 *    key `dispute-refund-<id>` INSIDE the resolve tx, reference = match;
 *  - outcome=rejected + amount → money NEVER moves (guarded before tx);
 *  - race loser (guarded status UPDATE hits 0 rows) → money NEVER moves —
 *    the throw happens before the credit branch (the run-#24 atomicity shape);
 *  - resolved without amount → no credit, no evidence entry;
 *  - no match on the dispute → ledger reference falls back to the dispute id;
 *  - evidence-append failure after commit is BEST-EFFORT — the resolution
 *    (and the already-committed credit) must survive it.
 *
 * creditWalletTx itself is mocked at the module boundary here; its ledger +
 * balance + replay contract is pinned by matches.credit-guard.spec.ts.
 */
jest.mock('../matches/match-fees', () => ({
  creditWalletTx: jest.fn().mockResolvedValue(undefined),
}));
const mockedCredit = creditWalletTx as jest.Mock;

describe('AdminDisputesService — P1-29 dispute refund (run #173)', () => {
  const DISPUTE_ID = 'd1';
  const nameOf = (t: unknown) => String((t as never)[Symbol.for('drizzle:Name')] ?? '');

  function updateChain(returningRows: unknown[]) {
    const chain: any = {
      set: () => chain,
      where: () => chain,
      returning: () => returningRows,
    };
    return chain;
  }

  function makeService(opts: {
    findOne?: jest.Mock;
    updateRows: unknown[];
    evidenceRow?: { id: string; evidence: unknown[] } | null;
    selectThrows?: boolean;
  }) {
    const findOne =
      opts.findOne ??
      jest.fn(async () => ({
        id: DISPUTE_ID,
        type: 'unrecognized_charge',
        status: 'opened',
        match_id: 'm1',
        reporter_id: 'u1',
        messages: [],
      }));

    const tx: any = {
      update: jest.fn(() => updateChain(opts.updateRows)),
      // Evidence append: SELECT … FOR UPDATE returns the locked row.
      select: opts.selectThrows
        ? jest.fn(() => {
            throw new Error('evidence append db failure');
          })
        : jest.fn(() => ({
            from: () => ({
              where: () => ({
                for: async () => [opts.evidenceRow ?? { id: DISPUTE_ID, evidence: [] }],
              }),
            }),
          })),
    };
    const db = {
      query: { disputes: {}, dispute_messages: {} },
      update: jest.fn(() => updateChain(opts.updateRows)),
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    const audit = { log: jest.fn(async () => {}) };
    const realtime = { broadcastOps: jest.fn() };
    const activities = { record: jest.fn(async () => {}) };
    const svc = new AdminDisputesService(
      db as never,
      audit as never,
      realtime as never,
      activities as never,
    );
    jest.spyOn(svc as never, 'findOne').mockImplementation(findOne as never);
    return { svc, db, tx, audit };
  }

  beforeEach(() => {
    mockedCredit.mockClear();
    mockedCredit.mockResolvedValue(undefined);
  });

  it('resolved + refundAmountSar: credits the reporter INSIDE the tx with the per-dispute key and match reference', async () => {
    const { svc, db } = makeService({ updateRows: [{ id: DISPUTE_ID }] });
    await svc.resolve(
      DISPUTE_ID,
      { outcome: 'resolved', decision: 'refund approved', refundAmountSar: 37.5 },
      'admin1',
    );
    expect(db.transaction).toHaveBeenCalledTimes(2); // resolve tx + evidence-append tx
    expect(mockedCredit).toHaveBeenCalledTimes(1);
    expect(mockedCredit).toHaveBeenCalledWith(
      expect.anything(), // the resolve tx handle
      'u1', // reporter
      37.5,
      `dispute-refund-${DISPUTE_ID}`,
      'REFUND',
      'm1', // match reference
    );
  });

  it('rejected + refundAmountSar: NO money moves, no refund evidence', async () => {
    const { svc, tx } = makeService({ updateRows: [{ id: DISPUTE_ID }] });
    await svc.resolve(
      DISPUTE_ID,
      { outcome: 'rejected', refundAmountSar: 50 },
      'admin1',
    );
    expect(mockedCredit).not.toHaveBeenCalled();
    // no evidence select chain either (no refund entry attempted)
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('race loser (guarded UPDATE hits 0 rows): throws 400 BEFORE the credit', async () => {
    const { svc } = makeService({ updateRows: [] });
    await expect(
      svc.resolve(
        DISPUTE_ID,
        { outcome: 'resolved', refundAmountSar: 50 },
        'admin1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mockedCredit).not.toHaveBeenCalled();
  });

  it('resolved WITHOUT refundAmountSar: no credit, no refund evidence', async () => {
    const { svc, tx } = makeService({ updateRows: [{ id: DISPUTE_ID }] });
    await svc.resolve(DISPUTE_ID, { outcome: 'resolved', decision: 'no money owed' }, 'admin1');
    expect(mockedCredit).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('dispute without a match: ledger reference falls back to the dispute id', async () => {
    const findOne = jest.fn(async () => ({
      id: DISPUTE_ID,
      type: 'other',
      status: 'opened',
      match_id: null,
      reporter_id: 'u2',
      messages: [],
    }));
    const { svc } = makeService({ findOne, updateRows: [{ id: DISPUTE_ID }] });
    await svc.resolve(DISPUTE_ID, { outcome: 'resolved', refundAmountSar: 12 }, 'admin1');
    expect(mockedCredit).toHaveBeenCalledWith(
      expect.anything(),
      'u2',
      12,
      `dispute-refund-${DISPUTE_ID}`,
      'REFUND',
      DISPUTE_ID,
    );
  });

  it('creditWalletTx failure INSIDE the tx rejects the resolution (atomic rollback shape)', async () => {
    mockedCredit.mockRejectedValue(new Error('wallet ledger failure'));
    const { svc } = makeService({ updateRows: [{ id: DISPUTE_ID }] });
    await expect(
      svc.resolve(DISPUTE_ID, { outcome: 'resolved', refundAmountSar: 20 }, 'admin1'),
    ).rejects.toThrow('wallet ledger failure');
  });

  it('evidence-append failure AFTER commit does not fail the resolution (best-effort record)', async () => {
    const { svc } = makeService({ updateRows: [{ id: DISPUTE_ID }], selectThrows: true });
    const after = await svc.resolve(
      DISPUTE_ID,
      { outcome: 'resolved', refundAmountSar: 20 },
      'admin1',
    );
    expect(after).toBeDefined();
    expect(mockedCredit).toHaveBeenCalledTimes(1); // the credit already committed
  });
});
