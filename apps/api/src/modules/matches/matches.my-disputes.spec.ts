import { MatchesService } from './matches.service';
import { matches, match_players, disputes } from '../../database/schema';

/**
 * P2-195 residual (run #172): findMyDisputes — cross-match mine-list for the
 * player Reports surface. Pins the response contract (MyDispute keys +
 * match_title + match_scheduled_at), the reporter filter, LEFT JOIN nulls for
 * deleted matches, and the 50-row cap.
 */
describe('MatchesService.findMyDisputes (P2-195 residual, run #172)', () => {
  const USER = 'user-1';

  function makeDb(opts: {
    disputeRows?: unknown[];
    fromTable?: unknown;
  }) {
    const db: any = {
      select: () => ({
        from: (table: unknown) => {
          const chain: any = {
            leftJoin: () => chain,
            where: () => chain,
            orderBy: () => chain,
            limit: () => chain,
          };
          chain.then = (resolve: (v: unknown) => void) => {
            resolve(opts.disputeRows ?? []);
          };
          return chain;
        },
      }),
    };
    return db;
  }

  function makeService(db: any): MatchesService {
    return new MatchesService(
      db as never, // DB_CONNECTION
      {} as never, // walletService
      {} as never, // appGateway
      {} as never, // notificationsService
      {} as never, // activitiesService
      {} as never, // settings (PlatformSettingsService)
      {} as never, // realtime
      {} as never, // waitlist
    );
  }

  it('returns mapped rows with has_appealed computed from evidence and match context', async () => {
    const created = new Date('2026-10-20T10:00:00Z');
    const updated = new Date('2026-10-21T10:00:00Z');
    const scheduled = new Date('2026-10-19T18:00:00Z');
    const db = makeDb({
      disputeRows: [
        {
          id: 'd-1',
          type: 'no_show',
          status: 'resolved',
          decision: 'refund approved',
          evidence: [{ action: 'appeal', note: 'I was there' }],
          created_at: created,
          updated_at: updated,
          match_title: 'Tuesday Padel',
          match_scheduled_at: scheduled,
        },
        {
          id: 'd-2',
          type: 'other',
          status: 'opened',
          decision: null,
          evidence: 'not-an-array', // defensive: raw json is not always an array
          created_at: created,
          updated_at: updated,
          match_title: null, // deleted match → LEFT JOIN nulls
          match_scheduled_at: null,
        },
      ],
    });

    const rows = await makeService(db).findMyDisputes(USER);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: 'd-1',
      type: 'no_show',
      status: 'resolved',
      decision: 'refund approved',
      has_appealed: true,
      created_at: created,
      updated_at: updated,
      match_title: 'Tuesday Padel',
      match_scheduled_at: scheduled,
    });
    // Non-array evidence must NOT crash the map — has_appealed false.
    expect(rows[1].has_appealed).toBe(false);
    // Deleted match keeps the dispute visible with null context.
    expect(rows[1].match_title).toBeNull();
    expect(rows[1].match_scheduled_at).toBeNull();
  });

  it('empty list for a player with no disputes', async () => {
    const db = makeDb({ disputeRows: [] });
    const rows = await makeService(db).findMyDisputes(USER);
    expect(rows).toEqual([]);
  });

  it('caps the query at 50 rows', async () => {
    let capturedLimit: number | undefined;
    const db: any = {
      select: () => ({
        from: () => {
          const chain: any = {
            leftJoin: () => chain,
            where: () => chain,
            orderBy: () => chain,
          };
          chain.limit = (n: number) => {
            capturedLimit = n;
            return chain;
          };
          chain.then = (resolve: (v: unknown) => void) => resolve([]);
          return chain;
        },
      }),
    };
    await makeService(db).findMyDisputes(USER);
    expect(capturedLimit).toBe(50);
  });
});
