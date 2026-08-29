import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players, disputes } from '../../database/schema';

/**
 * no_show_marked notification-accuracy regression specs (2026-08-29).
 *
 * 1. Host cannot mark HIMSELF as no-show → 400, zero notifications, zero
 *    dispute/wallet side effects. (Omar's feed showed 4 self-directed
 *    "you were marked" notifications before this fix.)
 * 2. Clearing a mark (noShow=false) must NOT send a "you were marked"
 *    notification.
 * 3. A real mark still notifies exactly the marked player.
 */
describe('MatchesService.markNoShow notification accuracy', () => {
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
    const recorded: Array<{ verb: string; recipients: string[]; actorId: string }> = [];
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
    const activitiesService = {
      record: async (p: { verb: string; recipients: string[]; actorId: string }) => {
        recorded.push(p);
      },
    };
    const svc = new MatchesService(
      db as never,
      {} as never, // walletService
      appGateway as never,
      {} as never, // notificationsService
      activitiesService as never,
      settings as never,
      realtime as never,
    );
    return { svc, recorded };
  }

  it('rejects a self-mark with BadRequest and records nothing', async () => {
    const { svc, recorded } = makeService({ id: 'mp-1', no_show: false });
    await expect(svc.markNoShow(HOST, MATCH_ID, HOST, true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(recorded).toHaveLength(0);
  });

  it('throws NotFound (not a TypeError/500) when the target is not in the roster', async () => {
    const { svc, recorded } = makeService(null);
    await expect(svc.markNoShow(HOST, MATCH_ID, TARGET, true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(recorded).toHaveLength(0);
  });

  it('rejects a non-host with Forbidden', async () => {
    const { svc, recorded } = makeService({ id: 'mp-1', no_show: false });
    await expect(
      svc.markNoShow('not-the-host', MATCH_ID, TARGET, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recorded).toHaveLength(0);
  });

  it('does NOT notify when CLEARING a no-show mark', async () => {
    const { svc, recorded } = makeService({ id: 'mp-1', no_show: true });
    const result = await svc.markNoShow(HOST, MATCH_ID, TARGET, false);
    expect(result.id).toBe(MATCH_ID);
    expect(recorded).toHaveLength(0);
  });

  it('notifies exactly the marked player on a real mark', async () => {
    const { svc, recorded } = makeService({ id: 'mp-1', no_show: false });
    await svc.markNoShow(HOST, MATCH_ID, TARGET, true);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      verb: 'no_show_marked',
      actorId: HOST,
      recipients: [TARGET],
    });
  });
});
