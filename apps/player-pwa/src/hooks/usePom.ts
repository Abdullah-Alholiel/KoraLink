'use client';

import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import { captureError, addBreadcrumb, trackEvent } from '@/providers/ObservabilityProvider';

// ─── API Response Types ────────────────────────────────

export interface PomCandidate {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  team: 'Home' | 'Away' | null;
  isHost: boolean;
}

export interface PomResultRow {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  voteCount: number;
}

export type PomResult =
  | {
      status: 'voting_open';
      completedAt: string;
      votingClosesAt: string;
      hasVoted: boolean;
      votedFor: string | null;
      totalEligibleVoters: number;
      votedCount: number;
      candidates: PomCandidate[];
    }
  | {
      status: 'completed';
      winner: { id: string; fullName: string; avatarUrl: string | null };
      voteCount: number;
      results: PomResultRow[];
    }
  | { status: 'no_winner' }
  | { status: 'no_votes' }
  | { status: 'not_completed' };

export interface VoteResult {
  matchId: string;
  votedFor: string;
  message: string;
}

/**
 * Optimistically applies a POTM vote to a `voting_open` result: flips
 * `hasVoted`, records `votedFor`, and increments `votedCount` only on a first
 * vote (changing an existing vote keeps the count). Non-`voting_open` states
 * pass through untouched. Pure + exported for unit tests.
 */
export function optimisticallyCastVote(
  result: PomResult,
  candidateId: string,
): PomResult {
  if (result.status !== 'voting_open') return result;
  const isNewVote = !result.hasVoted;
  return {
    ...result,
    hasVoted: true,
    votedFor: candidateId,
    votedCount: isNewVote ? result.votedCount + 1 : result.votedCount,
  };
}

// ─── Hooks ─────────────────────────────────────────────

export function usePomResult(matchId: string, currentUserId?: string) {
  return useQuery<PomResult, FetchError>({
    queryKey: ['pom', matchId, { currentUserId }],
    queryFn: async () => {
      try {
        return await fetcher<PomResult>(`/matches/${matchId}/pom-result`);
      } catch (err) {
        captureError(err, { hook: 'usePomResult', matchId });
        throw err;
      }
    },
    enabled: !!matchId,
    staleTime: 15_000,
  });
}

export function useVote(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    VoteResult,
    FetchError,
    string,
    { snapshot: [QueryKey, PomResult | undefined][] }
  >({
    mutationFn: async (candidateId: string) => {
      addBreadcrumb('POTM vote submitted', 'potm', 'info', { matchId, candidateId });
      try {
        const result = await fetcher<VoteResult>(`/matches/${matchId}/vote`, {
          method: 'POST',
          body: JSON.stringify({ candidateId }),
        });
        trackEvent('potm_vote_cast', {
          match_id: matchId,
          candidate_id: candidateId,
        });
        return result;
      } catch (err) {
        captureError(err, { hook: 'useVote', matchId, candidateId });
        throw err;
      }
    },
    onMutate: async (candidateId) => {
      await queryClient.cancelQueries({ queryKey: ['pom', matchId] });
      const snapshot = queryClient.getQueriesData<PomResult>({ queryKey: ['pom', matchId] });
      queryClient.setQueriesData<PomResult>({ queryKey: ['pom', matchId] }, (old) =>
        old ? optimisticallyCastVote(old, candidateId) : old,
      );
      return { snapshot };
    },
    onError: (_err, _candidateId, context) => {
      if (context?.snapshot) {
        for (const [key, data] of context.snapshot) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pom', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
      // Refresh has_voted on feed/my-games cards so the POTM button flips to
      // the "voted" state without a manual reload.
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}
