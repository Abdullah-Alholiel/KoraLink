import { ConflictException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players, disputes } from '../../database/schema';

/**
 * P2-139 (run #97): dispute evidence lost-update race. `attachAppeal` used to
 * read evidence → JS push → UPDATE with no lock and no status predicate, so
 * two concurrent appeals (or an appeal racing an admin close) silently
 * dropped one side's evidence. The append now runs in
 * `appendDisputeEvidenceAtomically`: db.transaction + SELECT … FOR UPDATE,
 * array built from the LOCKED row, status-predicated UPDATE.
 */
describe('MatchesService dispute evidence atomicity (P2-139)', () => {
  const HOST = 'host-1';
  const USER = 'player-1';
  const MATCH_ID = 'match-1';

  const MATCH_ROW = { id: MATCH_ID, host_id: HOST };
  const PLAYER_ROW = { id: 'mp-1', no_show: true };
  const PRIOR_ENTRY = { action: 'mark', by: HOST, at: '2026-10-01T00:00:00.000Z' };
  const OTHER_APPEAL = { action: 'appeal', reason: 'concurrent', at: '2026-10-01T00:00:01.000Z' };

  function disputeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'd1',
      match_id: MATCH_ID,
      reporter_id: USER,
      respondent_id: HOST,
      type: 'no_show',
      status: 'opened',
      decision: null,
      evidence: [PRIOR_ENTRY],
      created_at: new Date('2026-10-01T00:00:00Z'),
      updated_at: new Date('2026-10-01T00:00:00Z'),
      ...overrides,
    };
  }

  function rowChain(rows: unknown[], onFor?: () => unknown[]) {
    const chain: any = { where: () => chain, limit: () => chain };
    chain.for = jest.fn((mode: string) => {
      lockModes.push(mode);
      return rowChain(onFor ? onFor() : rows);
    });
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  }

  let lockModes: string[];

  function makeService(opts: {
    existing?: unknown | null;
    inserted?: unknown[];
    winner?: unknown | null;
    locked?: unknown | null;
  }) {
    lockModes = [];
    const updateSets: Record<string, unknown>[] = [];
    const locked = () => (opts.locked === null ? [] : [opts.locked ?? disputeRow()]);

    const db: any = {
      select: (sel: Record<string, unknown>) => ({
        from: (table: unknown) => {
          if (table === matches) return rowChain([MATCH_ROW]);
          if (table === match_players) return rowChain([PLAYER_ROW]);
          if (table === disputes) {
            if ('status' in (sel ?? {})) {
              return rowChain(opts.existing ? [opts.existing] : [], locked);
            }
            return rowChain(opts.winner ? [opts.winner] : []);
          }
          return rowChain([]);
        },
      }),
      update: jest.fn(() => {
        const chain: any = {
          set: (v: Record<string, unknown>) => {
            updateSets.push(v);
            return chain;
          },
          where: () => chain,
          returning: async () => [
            { ...(opts.locked ?? disputeRow()), ...updateSets[updateSets.length - 1] },
          ],
        };
        return chain;
      }),
      insert: jest.fn(() => {
        const chain: any = {
          values: () => chain,
          onConflictDoNothing: () => chain,
          returning: () => opts.inserted ?? [disputeRow({ evidence: [] })],
        };
        return chain;
      }),
    };
    db.transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));

    const realtime = { broadcastOps: jest.fn() };
    const service = new MatchesService(
      db as never,
      {} as never, // walletService
      { broadcastRosterUpdate: () => {} } as never,
      {} as never, // notificationsService
      { record: async () => undefined } as never,
      { getNumber: async () => 0 } as never,
      realtime as never,
      { promoteNextInTx: async () => null } as never,
    );
    const spy = jest.spyOn(service as never, 'appendDisputeEvidenceAtomically');
    return { service, db, realtime, updateSets, spy };
  }

  it('runs the append inside db.transaction with a FOR UPDATE row lock', async () => {
    const { service, db } = makeService({ existing: disputeRow() });

    await service.createDispute(USER, MATCH_ID, { type: 'no_show', reason: 'late' });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(lockModes).toEqual(['update']);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('builds the evidence from the LOCKED read plus exactly one appeal entry', async () => {
    // Fast-path read saw only PRIOR_ENTRY; a concurrent appeal landed before
    // the lock was taken — the locked read wins, nothing is dropped.
    const { service, updateSets } = makeService({
      existing: disputeRow(),
      locked: disputeRow({ evidence: [PRIOR_ENTRY, OTHER_APPEAL] }),
    });

    const result = await service.createDispute(USER, MATCH_ID, { type: 'no_show', reason: 'late' });

    expect(updateSets).toHaveLength(1);
    const evidence = updateSets[0].evidence as Record<string, unknown>[];
    expect(evidence).toHaveLength(3);
    expect(evidence.slice(0, 2)).toEqual([PRIOR_ENTRY, OTHER_APPEAL]);
    expect(evidence[2]).toEqual({ action: 'appeal', reason: 'late', at: expect.any(String) });
    expect(new Date(evidence[2].at as string).toISOString()).toBe(evidence[2].at);
    expect(result.has_appealed).toBe(true);
  });

  it('throws ConflictException and issues NO update when the locked dispute is already resolved', async () => {
    const { service, db } = makeService({
      existing: disputeRow(),
      locked: disputeRow({ status: 'resolved' }),
    });

    await expect(
      service.createDispute(USER, MATCH_ID, { type: 'no_show', reason: 'late' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the locked row is missing', async () => {
    const { service, db } = makeService({ existing: disputeRow(), locked: null });

    await expect(
      service.createDispute(USER, MATCH_ID, { type: 'no_show', reason: 'late' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('fast path (open dispute exists) delegates to the atomic helper', async () => {
    const { service, db, spy } = makeService({ existing: disputeRow() });

    await service.createDispute(USER, MATCH_ID, { type: 'no_show', reason: 'again' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ action: 'appeal', reason: 'again' }),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('winner re-read path (insert lost the race) delegates to the atomic helper', async () => {
    const { service, db, spy, realtime } = makeService({
      inserted: [],
      winner: { id: 'd1', evidence: [PRIOR_ENTRY] },
    });

    const result = await service.createDispute(USER, MATCH_ID, { type: 'no_show', reason: 'dup' });

    expect(db.insert).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('d1', expect.objectContaining({ action: 'appeal', reason: 'dup' }));
    expect(result.id).toBe('d1');
    expect(realtime.broadcastOps).not.toHaveBeenCalled();
  });

  it('plain insert path is unchanged: no transaction, no lock, no update', async () => {
    const { service, db, spy, realtime } = makeService({});

    const result = await service.createDispute(USER, MATCH_ID, { type: 'no_show', reason: 'x' });

    expect(result.id).toBe('d1');
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(lockModes).toEqual([]);
    expect(realtime.broadcastOps).toHaveBeenCalledWith('disputes');
  });
});
