import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players, match_votes } from '../../database/schema';

/**
 * P2-5 (run #38): castVote must return the POPULATED match (API Contract
 * Rule §2 — every mutation returns findOne outside the mutation), with
 * `votedFor` + `message` preserved additively for the PWA VoteResult type.
 * Before this spec's fix, castVote returned the bespoke
 * `{ matchId, votedFor, message }` shape — the P2-5 class exemplar.
 */
describe('MatchesService.castVote contract (P2-5, run #38)', () => {
  const VOTER = 'voter-1';
  const CANDIDATE = 'candidate-1';
  const MATCH_ID = 'match-1';

  const completedMatch = {
    id: MATCH_ID,
    host_id: 'host-1',
    status: 'Completed',
    scheduled_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // ended 2h ago
    duration_mins: 90,
    completed_at: new Date(Date.now() - 60 * 60 * 1000),
  };

  function thenable() {
    return { then: (r: (v: unknown) => void) => r([]) };
  }

  type DbRecorder = {
    txCalls: number;
    // Statements issued through the tx handle (vs. the root db).
    txOps: Array<{ op: 'select' | 'insert'; table?: unknown; lock?: string }>;
    rootOps: Array<{ op: 'select' | 'insert'; table?: unknown }>;
  };

  function makeDb(findOnePayload: unknown, matchRows: unknown[] = [completedMatch], rec?: DbRecorder) {
    function handle(ops: Array<{ op: 'select' | 'insert'; table?: unknown; lock?: string }>) {
      return {
        select: () => ({
          from: (table: unknown) => {
            const entry: { op: 'select'; table: unknown; lock?: string } = { op: 'select', table };
            ops.push(entry);
            const chain: any = {
              where: () => chain,
              limit: () => chain,
              for: (strength: string) => {
                entry.lock = strength;
                return chain;
              },
            };
            chain.then = (resolve: (v: unknown) => void) => {
              if (table === matches) resolve(matchRows);
              if (table === match_players) resolve([{ id: 'mp-1', no_show: false }]);
              resolve([]);
            };
            return chain;
          },
        }),
        insert: (table: unknown) => {
          ops.push({ op: 'insert', table });
          return {
            values: () => ({
              onConflictDoUpdate: () => thenable(),
            }),
          };
        },
      };
    }
    const r = rec ?? { txCalls: 0, txOps: [], rootOps: [] };
    const inner = handle(r.txOps);
    return {
      ...handle(r.rootOps),
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
        r.txCalls += 1;
        return cb(inner);
      },
      query: {
        matches: {
          findFirst: async () => findOnePayload,
        },
      },
    };
  }

  function makeService(findOnePayload: unknown, matchRows?: unknown[], rec?: DbRecorder) {
    return new MatchesService(
      makeDb(findOnePayload, matchRows, rec) as never,
      {} as never,
      { broadcastRosterUpdate: () => {} } as never,
      {} as never,
      { record: async () => {} } as never,
      { getNumber: async () => 0 } as never,
      { broadcastOps: () => {} } as never,
      { promoteNextInTx: async () => null } as never,
    );
  }

  it('returns the populated match + votedFor + message (additive contract)', async () => {
    const populated = {
      id: MATCH_ID,
      status: 'Completed',
      host: { id: 'host-1', full_name: 'Host' },
      players: [{ userId: VOTER }],
      messages: [],
    };
    const svc = makeService(populated);
    const result = await svc.castVote(VOTER, MATCH_ID, CANDIDATE);

    // Populated payload present
    expect(result.id).toBe(MATCH_ID);
    expect(result.host).toEqual({ id: 'host-1', full_name: 'Host' });
    expect(Array.isArray((result as Record<string, unknown>).players)).toBe(true);
    // Additive fields preserved for the PWA VoteResult type
    expect(result.votedFor).toBe(CANDIDATE);
    expect(result.message).toBe('Vote recorded.');
  });

  it('rejects self-votes', async () => {
    const svc = makeService({});
    await expect(
      svc.castVote(VOTER, MATCH_ID, VOTER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s a missing match (NotFound, not 500)', async () => {
    const svc = makeService({}, []);
    await expect(
      svc.castVote(VOTER, 'no-such-match', CANDIDATE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── P2-118: transactional predicate ───────────────────────────────────────
  // The state/window/roster checks and the upsert used to run outside any tx
  // against an unlocked row, so a concurrent completeMatch / markNoShow flip
  // could admit a stale-state vote.

  const populated = {
    id: MATCH_ID,
    status: 'Completed',
    host: { id: 'host-1', full_name: 'Host' },
    players: [{ userId: VOTER }],
    messages: [],
  };

  it('runs the match select and the vote upsert inside one db.transaction', async () => {
    const rec: DbRecorder = { txCalls: 0, txOps: [], rootOps: [] };
    const svc = makeService(populated, undefined, rec);
    await svc.castVote(VOTER, MATCH_ID, CANDIDATE);

    expect(rec.txCalls).toBe(1);
    expect(rec.txOps.some((o) => o.op === 'select' && o.table === matches)).toBe(true);
    expect(rec.txOps.some((o) => o.op === 'insert' && o.table === match_votes)).toBe(true);
    // Neither the match read nor the upsert leaks onto the root handle.
    expect(rec.rootOps.some((o) => o.table === matches || o.table === match_votes)).toBe(false);
  });

  it('locks the matches row FOR UPDATE inside the tx', async () => {
    const rec: DbRecorder = { txCalls: 0, txOps: [], rootOps: [] };
    const svc = makeService(populated, undefined, rec);
    await svc.castVote(VOTER, MATCH_ID, CANDIDATE);

    const first = rec.txOps[0];
    expect(first).toEqual({ op: 'select', table: matches, lock: 'update' });
  });

  it('preserves the additive contract (populated match + votedFor + message)', async () => {
    const rec: DbRecorder = { txCalls: 0, txOps: [], rootOps: [] };
    const svc = makeService(populated, undefined, rec);
    const result = await svc.castVote(VOTER, MATCH_ID, CANDIDATE);

    expect(result.id).toBe(MATCH_ID);
    expect(result.host).toEqual({ id: 'host-1', full_name: 'Host' });
    expect(result.votedFor).toBe(CANDIDATE);
    expect(result.message).toBe('Vote recorded.');
  });
});
