'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

export function useJoinMatch() {
  const queryClient = useQueryClient();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/join`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
    },
  });
}

export function useLeaveMatch() {
  const queryClient = useQueryClient();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/leave`, { method: 'DELETE' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
    },
  });
}

// ─── Cancel Match (Host) ────────────────────────────────

export function useCancelMatch() {
  const queryClient = useQueryClient();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/cancel`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
    },
  });
}

// ─── Start Match (Host: Full → InProgress) ──────────────

export function useStartMatch() {
  const queryClient = useQueryClient();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/start`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
    },
  });
}

// ─── Complete Match (Host: InProgress → Completed) ──────

export function useCompleteMatch() {
  const queryClient = useQueryClient();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/complete`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      queryClient.invalidateQueries({ queryKey: ['pom', matchId] });
    },
  });
}
