import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players, disputes } from '../../database/schema';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

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

  /**
   * P1-21 regression (run #13): clearing the mark used to close the
   * auto-opened dispute with `status IN ('opened','under_review')`, silently
   * rejecting a dispute an admin had already picked up ('under_review').
   * The closure must now target `status = 'opened'` only.
   */
  it('clearing a mark closes only OPEN disputes, never admin under_review rows', async () => {
    let capturedWhere: unknown;
    function thenable(): { then: (r: (v: unknown) => void) => void } {
      return { then: (r: (v: unknown) => void) => r([]) };
    }
    const tx = {
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === matches) resolve([baseMatch]);
            else if (table === match_players) resolve([{ id: 'mp-1', no_show: true }]);
            else resolve([]); // disputes select → no existing open row
          };
          return chain;
        },
      }),
      update: (table: unknown) => ({
        set: () => ({
          where: (whereArg: unknown) => {
            if (table === disputes) capturedWhere = whereArg;
            return thenable();
          },
        }),
      }),
      insert: () => ({ values: () => thenable() }),
    };
    const db = {
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
      query: {
        matches: {
          findFirst: async () => ({ id: MATCH_ID, status: 'Completed', messages: [] }),
        },
      },
    };
    const svc = new MatchesService(
      db as never,
      {} as never,
      { broadcastRosterUpdate: () => {} } as never,
      {} as never,
      { record: async () => {} } as never,
      { getNumber: async () => 0 } as never,
      { broadcastOps: () => {} } as never,
    );

    // Host CLEARS the mark (noShow=false) on a currently-marked player.
    await svc.markNoShow(HOST, MATCH_ID, TARGET, false);

    expect(capturedWhere).toBeDefined();
    const sqlText = new PgDialect().sqlToQuery(capturedWhere as SQL).sql;
    expect(sqlText).toContain('"disputes"."status" =');
    expect(sqlText).not.toContain('in (');
  });
});
