'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

// ─── API Response Types ────────────────────────────────

export interface PomCandidate {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export type PomResult =
  | { status: 'voting_open'; completedAt: string; votingClosesAt: string; hasVoted: boolean; votedFor: string | null; candidates: PomCandidate[] }
  | { status: 'completed'; winner: { id: string; fullName: string; avatarUrl: string | null }; voteCount: number }
  | { status: 'no_winner' }
  | { status: 'not_completed' };

export interface VoteResult {
  matchId: string;
  votedFor: string;
  message: string;
}

// ─── Hooks ─────────────────────────────────────────────

export function usePomResult(matchId: string, currentUserId?: string) {
  return useQuery<PomResult, FetchError>({
    queryKey: ['pom', matchId, { currentUserId }],
    queryFn: () => fetcher<PomResult>(`/matches/${matchId}/pom-result`),
    enabled: !!matchId,
    staleTime: 30_000,
  });
}

export function useVote(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation<VoteResult, FetchError, string>({
    mutationFn: (candidateId: string) =>
      fetcher<VoteResult>(`/matches/${matchId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ candidateId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pom', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
    },
  });
}
