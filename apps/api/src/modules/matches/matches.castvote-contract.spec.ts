import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { matches, match_players } from '../../database/schema';

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

  function makeDb(findOnePayload: unknown, matchRows: unknown[] = [completedMatch]) {
    return {
      select: () => ({
        from: (table: unknown) => {
          const chain: any = { where: () => chain, limit: () => chain };
          chain.then = (resolve: (v: unknown) => void) => {
            if (table === matches) resolve(matchRows);
            if (table === match_players) resolve([{ id: 'mp-1', no_show: false }]);
            resolve([]);
          };
          return chain;
        },
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => thenable(),
        }),
      }),
      query: {
        matches: {
          findFirst: async () => findOnePayload,
        },
      },
    };
  }

  function makeService(findOnePayload: unknown, matchRows?: unknown[]) {
    return new MatchesService(
      makeDb(findOnePayload, matchRows) as never,
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
});
