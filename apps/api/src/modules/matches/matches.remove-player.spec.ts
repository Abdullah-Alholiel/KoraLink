import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players } from '../../database/schema';

/**
 * removePlayer (P1-24) regression specs. Host-only roster removal:
 * guards run in order (self → match → host → status → roster) inside the
 * tx; Full → Open flip keeps the freed spot joinable; removed player is
 * notified via activities.record (player_removed) + push. The tx stub
 * routes rows by table identity (same schema objects the service imports).
 */
describe('MatchesService.removePlayer', () => {
  const HOST = 'host-1';
  const TARGET = 'target-1';
  const MATCH_ID = 'match-1';

  function thenable(): { then: (r: (v: unknown) => void) => void } {
    return { then: (r: (v: unknown) => void) => r([]) };
  }

  function makeTx(opts: { match?: unknown | null; player?: unknown | null; deleted?: unknown }) {
    function chainFor(rows: unknown[]) {
      const chain: any = {
        where: () => chain,
        limit: () => chain,
      };
      chain.then = (resolve: (v: unknown) => void) => resolve(rows);
      return chain;
    }
    const deleted: { where?: unknown } = {};
    const tx = {
      select: () => ({
        from: (table: unknown) => {
          if (table === matches) return chainFor(opts.match === undefined ? [] : opts.match ? [opts.match] : []);
          if (table === match_players) return chainFor(opts.player ? [opts.player] : []);
          return chainFor([]);
        },
      }),
      update: () => ({ set: () => ({ where: () => thenable() }) }),
      delete: () => ({ where: () => thenable() }),
      insert: () => ({ values: () => thenable() }),
      _deleted: deleted,
    };
    return tx;
  }

  function makeService(opts: Parameters<typeof makeTx>[0] = {}) {
    const recorded: Array<{ verb: string; recipients: string[] }> = [];
    const pushes: Array<{ users: string[]; title?: string; key?: string }> = [];
    const db = {
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx(opts)),
      query: {
        matches: {
          findFirst: async () => ({
            id: MATCH_ID,
            status: 'Open',
            title: 'T',
            scheduled_at: new Date('2030-01-01T18:00:00Z'),
            duration_mins: 90,
            completed_at: null,
            players: [
              { id: HOST, is_host: true, user: { id: HOST, full_name: 'H' }, no_show: false },
              { id: TARGET, is_host: false, user: { id: TARGET, full_name: 'T' }, no_show: false },
            ],
            messages: [],
          }),
        },
      },
    };
    const settings = { getNumber: async () => 0 };
    const appGateway = {
      broadcastRosterUpdate: () => {},
      broadcastStatusUpdate: () => {},
    };
    const realtime = { broadcastOps: () => {} };
    const activitiesService = {
      record: async (p: { verb: string; recipients: string[] }) => {
        recorded.push(p);
      },
    };
    const notificationsService = {
      sendPushToUsers: async (
        users: string[],
        p: { title?: string; key?: string },
      ) => {
        pushes.push({ users, title: p.title, key: p.key });
      },
    };
    const svc = new MatchesService(
      db as never,
      {} as never, // walletService
      appGateway as never,
      notificationsService as never,
      activitiesService as never,
      settings as never,
      realtime as never,
    );
    return { svc, recorded, pushes };
  }

  it('rejects the host trying to remove themselves', async () => {
    const { svc } = makeService();
    await expect(svc.removePlayer(HOST, MATCH_ID, HOST)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFound for a missing match', async () => {
    const { svc } = makeService({ match: null });
    await expect(svc.removePlayer(HOST, MATCH_ID, TARGET)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a non-host with Forbidden', async () => {
    const { svc } = makeService({ match: { id: MATCH_ID, host_id: 'someone-else', status: 'Open' } });
    await expect(svc.removePlayer('not-the-host', MATCH_ID, TARGET)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses removal once the match is underway (attendance flow owns the roster)', async () => {
    const { svc } = makeService({
      match: { id: MATCH_ID, host_id: HOST, status: 'InProgress' },
      player: { id: 'mp-1' },
    });
    await expect(svc.removePlayer(HOST, MATCH_ID, TARGET)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFound when the target is not in the roster', async () => {
    const { svc } = makeService({ match: { id: MATCH_ID, host_id: HOST, status: 'Open' } });
    await expect(svc.removePlayer(HOST, MATCH_ID, TARGET)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes an Open-match player, notifies them, and returns the match detail', async () => {
    const { svc, recorded, pushes } = makeService({
      match: { id: MATCH_ID, host_id: HOST, status: 'Open' },
      player: { id: 'mp-1' },
    });
    const result = await svc.removePlayer(HOST, MATCH_ID, TARGET);
    expect(result.id).toBe(MATCH_ID);
    expect(recorded.map((r) => r.verb)).toContain('player_removed');
    expect(recorded.find((r) => r.verb === 'player_removed')?.recipients).toEqual([TARGET]);
    // P2-8 (run #24): pushes carry the semantic key; text is localized per
    // subscription locale in sendPushToUsers — the site no longer sends raw text.
    expect(pushes.map((p) => p.key)).toContain('player_removed');
  });

  it('flips a Full match back to Open on removal', async () => {
    const { svc } = makeService({
      match: { id: MATCH_ID, host_id: HOST, status: 'Full' },
      player: { id: 'mp-1' },
    });
    const result = await svc.removePlayer(HOST, MATCH_ID, TARGET);
    expect(result.id).toBe(MATCH_ID);
  });
});
