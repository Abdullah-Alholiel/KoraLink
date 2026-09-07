import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players, disputes } from '../../database/schema';

/**
 * P2-5 residual contract (run #39): createDispute must return the SAME shape
 * as findMyDispute ({id,type,status,decision,has_appealed,created_at,
 * updated_at}) — the PWA `useAppeal` hook types this response as `MyDispute`.
 * Before this spec, both the fresh-insert path and the attachAppeal path
 * returned the bare disputes row (raw evidence json, has_appealed silently
 * undefined on a typed field).
 */
describe('MatchesService.createDispute contract (P2-5, run #39)', () => {
  const USER = 'user-1';
  const MATCH_ID = 'match-1';

  const matchRow = { id: MATCH_ID, host_id: 'host-1' };
  const markedPlayer = { id: 'mp-1', no_show: true };

  const MY_DISPUTE_KEYS = [
    'id',
    'type',
    'status',
    'decision',
    'has_appealed',
    'created_at',
    'updated_at',
  ];

  function makeDb(opts: {
    matchRows?: unknown[];
    playerRows?: unknown[];
    existingDisputes?: unknown[];
    insertedDispute?: unknown[];
    updatedDispute?: unknown[];
  }) {
    return {
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === matches) resolve(opts.matchRows ?? [matchRow]);
            else if (table === match_players) resolve(opts.playerRows ?? [markedPlayer]);
            else if (table === disputes) resolve(opts.existingDisputes ?? []);
            else resolve([]);
          };
          return chain;
        },
      }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => opts.insertedDispute ?? [],
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => opts.updatedDispute ?? [],
          }),
        }),
      }),
    };
  }

  function makeService(db: ReturnType<typeof makeDb>) {
    return new MatchesService(
      db as never,
      {} as never,
      { broadcastRosterUpdate: () => {} } as never,
      {} as never,
      { record: async () => {} } as never,
      { getNumber: async () => 0 } as never,
      { broadcastOps: () => {} } as never,
      { promoteNextInTx: async () => null } as never,
    );
  }

  it('fresh insert returns the MyDispute shape (has_appealed=false, no raw-row leakage)', async () => {
    const inserted = {
      id: 'd-1',
      match_id: MATCH_ID,
      reporter_id: USER,
      respondent_id: 'host-1',
      type: 'no_show',
      status: 'opened',
      evidence: [{ reason: 'was there', at: '2026-09-07T00:00:00Z' }],
      decision: null,
      decided_by: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const svc = makeService(makeDb({ insertedDispute: [inserted] }));
    const result = await svc.createDispute(USER, MATCH_ID, { reason: 'was there' });

    expect(Object.keys(result).sort()).toEqual([...MY_DISPUTE_KEYS].sort());
    expect(result).toMatchObject({
      id: 'd-1',
      type: 'no_show',
      status: 'opened',
      decision: null,
      has_appealed: false,
    });
    expect((result as Record<string, unknown>).evidence).toBeUndefined();
    expect((result as Record<string, unknown>).reporter_id).toBeUndefined();
  });

  it('attachAppeal path (host auto-opened dispute exists) returns has_appealed=true', async () => {
    const updated = {
      id: 'd-0',
      match_id: MATCH_ID,
      reporter_id: USER,
      respondent_id: 'host-1',
      type: 'no_show',
      status: 'opened',
      evidence: [{ action: 'appeal', reason: 'appeal reason', at: '2026-09-07T01:00:00Z' }],
      decision: null,
      decided_by: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const svc = makeService(
      makeDb({
        existingDisputes: [{ id: 'd-0', status: 'opened', evidence: [] }],
        updatedDispute: [updated],
      }),
    );
    const result = await svc.createDispute(USER, MATCH_ID, { reason: 'appeal reason' });

    expect(Object.keys(result).sort()).toEqual([...MY_DISPUTE_KEYS].sort());
    expect(result.has_appealed).toBe(true);
    expect(result.status).toBe('opened');
  });

  it('shape parity: createDispute and findMyDispute expose the same key set', async () => {
    const inserted = {
      id: 'd-2',
      match_id: MATCH_ID,
      reporter_id: USER,
      respondent_id: 'host-1',
      type: 'no_show',
      status: 'opened',
      evidence: [],
      decision: null,
      decided_by: null,
      created_at: new Date('2026-09-07T00:00:00Z'),
      updated_at: new Date('2026-09-07T00:00:00Z'),
    };
    const svc = makeService(makeDb({ insertedDispute: [inserted] }));
    const created = await svc.createDispute(USER, MATCH_ID, {});

    // findMyDispute reads through the same db mock (select on disputes → [] means
    // null, so instead assert against the documented contract key set — the two
    // methods must never drift apart shape-wise).
    expect(Object.keys(created).sort()).toEqual([...MY_DISPUTE_KEYS].sort());
  });

  it('guards unchanged: non-participant 403, unmarked no_show 400, missing match 404', async () => {
    const svc403 = makeService(makeDb({ playerRows: [] }));
    await expect(svc403.createDispute(USER, MATCH_ID, {})).rejects.toThrow(ForbiddenException);

    const svc400 = makeService(makeDb({ playerRows: [{ id: 'mp-1', no_show: false }] }));
    await expect(svc400.createDispute(USER, MATCH_ID, {})).rejects.toThrow(BadRequestException);

    const svc404 = makeService(makeDb({ matchRows: [] }));
    await expect(svc404.createDispute(USER, MATCH_ID, {})).rejects.toThrow(NotFoundException);
  });
});
