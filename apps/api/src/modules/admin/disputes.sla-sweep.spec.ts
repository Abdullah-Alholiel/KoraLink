import { AdminDisputesService } from './disputes.service';

/**
 * P1-63 dispute SLA sweep (run #118): overdue open/under_review disputes get
 * ONE `sla_escalated` evidence entry + queue flag. Idempotent (guarded UPDATE
 * + evidence dedup inside a FOR UPDATE row lock); one bad row never kills the
 * sweep; already-escalated rows are skipped.
 */
describe('AdminDisputesService — SLA sweep (P1-63)', () => {
  function makeService(opts: {
    candidates: unknown[];
    lockedRows: Record<string, unknown>[];
    updateRows?: unknown[];
    transactionThrowsOn?: number;
  }) {
    const capturedSets: unknown[] = [];
    let txCount = 0;
    let lockIdx = 0;

    const tx = {
      select: jest.fn(() => ({
        from: () => ({
          where: () => ({
            // .for('update') terminal — resolve with the NEXT locked row
            for: async () => [opts.lockedRows[lockIdx++] ?? null],
          }),
        }),
      })),
      update: jest.fn(() => {
        const chain: {
          set: (v: unknown) => unknown;
          where: () => unknown;
          returning: () => unknown[];
        } = {
          set: (v: unknown) => {
            capturedSets.push(v);
            return chain;
          },
          where: () => chain,
          returning: () => opts.updateRows ?? [{ id: 'd1' }],
        };
        return chain;
      }),
    };

    const db = {
      query: { disputes: {}, dispute_messages: {} },
      select: jest.fn(() => ({
        from: () => ({
          where: async () => opts.candidates,
        }),
      })),
      transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => {
        txCount += 1;
        if (opts.transactionThrowsOn !== undefined && txCount === opts.transactionThrowsOn) {
          throw new Error('row boom');
        }
        return cb(tx);
      }),
    };
    const svc = new AdminDisputesService(
      db as never,
      { log: jest.fn(async () => {}) } as never,
      { broadcastOps: jest.fn() } as never,
      { record: jest.fn(async () => {}) } as never,
    );
    return { svc, tx, capturedSets };
  }

  it('escalates an overdue dispute: sets flag + appends ONE sla_escalated entry', async () => {
    const { svc, capturedSets } = makeService({
      candidates: [{ id: 'd1' }],
      lockedRows: [{ id: 'd1', evidence: [{ action: 'marked_no_show' }], slaEscalated: false }],
    });
    const escalated = await svc.escalateOverdueDisputes();
    expect(escalated).toBe(1);
    expect(capturedSets).toHaveLength(1);
    const set = capturedSets[0] as { sla_escalated: boolean; evidence: { action: string }[] };
    expect(set.sla_escalated).toBe(true);
    expect(set.evidence).toHaveLength(2);
    expect(set.evidence[1].action).toBe('sla_escalated');
  });

  it('skips already-escalated rows (flag true) without writing', async () => {
    const { svc, tx, capturedSets } = makeService({
      candidates: [{ id: 'd1' }],
      lockedRows: [{ id: 'd1', evidence: [], slaEscalated: true }],
    });
    const escalated = await svc.escalateOverdueDisputes();
    expect(escalated).toBe(0);
    expect(tx.update).not.toHaveBeenCalled();
    expect(capturedSets).toHaveLength(0);
  });

  it('dedups on the evidence entry even when the flag lags', async () => {
    const { svc, tx, capturedSets } = makeService({
      candidates: [{ id: 'd1' }],
      lockedRows: [
        { id: 'd1', evidence: [{ action: 'sla_escalated', at: 'yesterday' }], slaEscalated: false },
      ],
    });
    const escalated = await svc.escalateOverdueDisputes();
    expect(escalated).toBe(0);
    expect(tx.update).not.toHaveBeenCalled();
    expect(capturedSets).toHaveLength(0);
  });

  it('counts zero when the guarded UPDATE matches no rows (race lost)', async () => {
    const { svc, capturedSets } = makeService({
      candidates: [{ id: 'd1' }],
      lockedRows: [{ id: 'd1', evidence: [], slaEscalated: false }],
      updateRows: [],
    });
    const escalated = await svc.escalateOverdueDisputes();
    expect(escalated).toBe(0);
    expect(capturedSets).toHaveLength(1); // write attempted, then rolled back by predicate
  });

  it('a failing row never kills the sweep — later rows still escalate', async () => {
    const { svc, capturedSets } = makeService({
      candidates: [{ id: 'd1' }, { id: 'd2' }],
      lockedRows: [
        { id: 'd1', evidence: [], slaEscalated: false },
        { id: 'd2', evidence: [], slaEscalated: false },
      ],
      transactionThrowsOn: 1,
    });
    const escalated = await svc.escalateOverdueDisputes();
    expect(escalated).toBe(1);
    expect(capturedSets).toHaveLength(1);
    const set = capturedSets[0] as { sla_escalated: boolean };
    expect(set.sla_escalated).toBe(true);
  });
});
