import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players, disputes } from '../../database/schema';

/**
 * markNoShow roster-guard regression specs. Before the fix, the service read
 * `player.no_show` BEFORE the `if (!player)` guard, so marking a non-roster
 * user threw a TypeError (HTTP 500) instead of a clean NotFound (404). The
 * tx stub routes rows by table identity (same schema objects the service
 * imports).
 */
describe('MatchesService.markNoShow roster guard', () => {
  const HOST = 'host-1';
  const TARGET = 'target-1';
  const MATCH_ID = 'match-1';

  const baseMatch = {
    id: MATCH_ID,
    host_id: HOST,
    status: 'Completed',
    scheduled_at: new Date('2020-01-01T18:00:00Z'), // far past → grace window satisfied
  };

  function thenable(): { then: (r: (v: unknown) => void) => void } {
    return { then: (r: (v: unknown) => void) => r([]) };
  }

  function makeTx(playerRow: unknown | null) {
    function chainFor(rows: unknown[]) {
      const chain: any = {
        where: () => chain,
        limit: () => chain,
      };
      chain.then = (resolve: (v: unknown) => void) => resolve(rows);
      return chain;
    }
    return {
      select: () => ({
        from: (table: unknown) => {
          if (table === matches) return chainFor([baseMatch]);
          if (table === match_players) return chainFor(playerRow ? [playerRow] : []);
          if (table === disputes) return chainFor([]);
          return chainFor([]);
        },
      }),
      update: () => ({ set: () => ({ where: () => thenable() }) }),
      insert: () => ({ values: () => thenable() }),
    };
  }

  function makeService(playerRow: unknown | null) {
    const db = {
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx(playerRow)),
      query: {
        matches: {
          findFirst: async () => ({ id: MATCH_ID, status: 'Completed', messages: [] }),
        },
      },
    };
    const settings = { getNumber: async () => 0 };
    const appGateway = { broadcastRosterUpdate: () => {} };
    const realtime = { broadcastOps: () => {} };
    const activitiesService = { record: async () => {} };
    return new MatchesService(
      db as never,
      {} as never, // walletService
      appGateway as never,
      {} as never, // notificationsService
      activitiesService as never,
      settings as never,
      realtime as never,
    );
  }

  it('throws NotFound (not a TypeError/500) when the target is not in the roster', async () => {
    const svc = makeService(null);
    await expect(
      svc.markNoShow(HOST, MATCH_ID, TARGET, true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a non-host with Forbidden', async () => {
    const svc = makeService({ id: 'mp-1', no_show: false });
    await expect(
      svc.markNoShow('not-the-host', MATCH_ID, TARGET, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('marks an existing player and returns the match detail', async () => {
    const svc = makeService({ id: 'mp-1', no_show: false });
    const result = await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    expect(result.id).toBe(MATCH_ID);
  });
});
