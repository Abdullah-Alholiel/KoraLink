import { ConflictException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players, disputes } from '../../database/schema';

/**
 * `createDispute` idempotency (run #8): the dispute open was a
 * `findFirst`→`insert` TOCTOU with no unique index on (match_id, reporter_id,
 * type), so a concurrent double-tap could open two identical disputes. The
 * insert is now guarded by `onConflictDoNothing` against the partial unique
 * index `disputes_open_uidx` WHERE status IN ('opened','under_review'), with a
 * winner re-read that attaches the appeal as evidence — mirroring
 * `reports_open_subject_uidx` (P2-9).
 */
describe('MatchesService.createDispute idempotency', () => {
  const HOST = 'host-1';
  const USER = 'player-1';
  const MATCH_ID = 'match-1';

  const MATCH_ROW = { id: MATCH_ID, host_id: HOST };
  const PLAYER_ROW = { id: 'mp-1', no_show: true };
  const DISPUTE_ROW = {
    id: 'd1',
    match_id: MATCH_ID,
    reporter_id: USER,
    respondent_id: HOST,
    type: 'no_show',
    status: 'opened',
    evidence: [],
  };

  function rowChain(rows: unknown[]) {
    const chain: any = { where: () => chain, limit: () => chain };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  }

  function makeService(opts: {
    existing?: unknown | null;
    inserted?: unknown[];
    winner?: unknown | null;
  }) {
    const db: any = {
      select: (sel: Record<string, unknown>) => ({
        from: (table: unknown) => {
          if (table === matches) return rowChain([MATCH_ROW]);
          if (table === match_players) return rowChain([PLAYER_ROW]);
          if (table === disputes) {
            // Two selects hit disputes: the fast-path (id,status,evidence) and
            // the winner re-read (id,evidence) after an insert conflict.
            if ('status' in (sel ?? {})) {
              return rowChain(opts.existing ? [opts.existing] : []);
            }
            return rowChain(opts.winner ? [opts.winner] : []);
          }
          return rowChain([]);
        },
      }),
      update: jest.fn(() => ({
        set: () => ({
          where: () => ({ returning: () => [opts.winner ?? DISPUTE_ROW] }),
        }),
      })),
      insert: jest.fn(() => {
        const chain: any = {
          values: () => chain,
          onConflictDoNothing: () => chain,
          returning: () => opts.inserted ?? [DISPUTE_ROW],
        };
        return chain;
      }),
    };

    const appGateway = { broadcastRosterUpdate: () => {} };
    const realtime = { broadcastOps: jest.fn() };
    const activitiesService = { record: async () => undefined };

    const service = new MatchesService(
      db as never,
      {} as never, // walletService
      appGateway as never,
      {} as never, // notificationsService
      activitiesService as never,
      { getNumber: async () => 0 } as never,
      realtime as never,
    );
    return { service, db, realtime };
  }

  it('inserts and returns the new dispute on the first appeal', async () => {
    const { service, db, realtime } = makeService({ inserted: [DISPUTE_ROW] });

    const result = await service.createDispute(USER, MATCH_ID, {
      type: 'no_show',
      reason: 'x',
    });

    expect(result.id).toBe('d1');
    expect(db.insert).toHaveBeenCalled();
    expect(realtime.broadcastOps).toHaveBeenCalledWith('disputes');
  });

  it('appends appeal evidence on a sequential retry (existing dispute, no insert)', async () => {
    const { service, db } = makeService({ existing: DISPUTE_ROW });

    const result = await service.createDispute(USER, MATCH_ID, {
      type: 'no_show',
      reason: 'again',
    });

    expect(result.id).toBe('d1');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('re-reads the winner and appends the appeal when the unique index swallows a concurrent duplicate', async () => {
    const { service, db, realtime } = makeService({
      inserted: [],
      winner: DISPUTE_ROW,
    });

    const result = await service.createDispute(USER, MATCH_ID, {
      type: 'no_show',
      reason: 'late',
    });

    expect(result.id).toBe('d1');
    // Ops ping must NOT re-fire on the duplicate path.
    expect(realtime.broadcastOps).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it('throws ConflictException when the insert loses the race and no winner row exists', async () => {
    const { service } = makeService({ inserted: [], winner: null });

    await expect(
      service.createDispute(USER, MATCH_ID, { type: 'no_show', reason: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
