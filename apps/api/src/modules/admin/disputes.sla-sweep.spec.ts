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

  // PR-Agent run-#118 r3 IMPORTANT (behavior REVERSED by design): a historical
  // sla_escalated evidence entry must NOT block re-escalation after a reopen
  // (the flag was reset; multiple entries across neglect episodes = history).
  it('re-escalates a reopened dispute despite its old sla_escalated entry', async () => {
    const { svc, tx, capturedSets } = makeService({
      candidates: [{ id: 'd1' }],
      lockedRows: [
        { id: 'd1', evidence: [{ action: 'sla_escalated', at: 'yesterday' }], slaEscalated: false },
      ],
    });
    const escalated = await svc.escalateOverdueDisputes();
    expect(escalated).toBe(1);
    expect(tx.update).toHaveBeenCalled();
    expect(capturedSets).toHaveLength(1);
    const set = capturedSets[0] as { evidence: { action: string }[] };
    expect(set.evidence).toHaveLength(2); // old entry + the new episode's entry
    expect(set.evidence[1].action).toBe('sla_escalated');
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

  // PR-Agent run-#118 r2: the neglect clock keys on updated_at, not
  // created_at — a freshly reopened old dispute must NOT re-flag instantly.
  it('keys the window on updated_at (reopened disputes get a fresh 7 days)', async () => {
    const whereFragments: unknown[] = [];
    const db = {
      query: { disputes: {}, dispute_messages: {} },
      select: jest.fn(() => {
        const chain: { from: () => { where: (w: unknown) => Promise<unknown[]> } } = {
          from: () => ({
            where: async (w: unknown) => {
              whereFragments.push(w);
              return [];
            },
          }),
        };
        return chain;
      }),
      transaction: jest.fn(async () => undefined),
    };
    const svc = new AdminDisputesService(
      db as never,
      { log: jest.fn(async () => {}) } as never,
      { broadcastOps: jest.fn() } as never,
      { record: jest.fn(async () => {}) } as never,
    );
    const escalated = await svc.escalateOverdueDisputes();
    expect(escalated).toBe(0);
    // Drizzle fragments hold circular table refs — walk column names safely.
    const seen: string[] = [];
    const walk = (node: unknown, depth = 0): void => {
      if (depth > 6 || node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, depth + 1));
        return;
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (typeof v === 'string') seen.push(`${k}=${v}`);
        else if (v && typeof v === 'object' && (k === 'name' || k === 'column')) seen.push(k);
        walk(v, depth + 1);
      }
    };
    walk(whereFragments[0]);
    const joined = seen.join('|');
    expect(joined).toContain('sla_escalated');
    expect(joined).toContain('updated_at');
    expect(joined).not.toContain('created_at');
  });
});
