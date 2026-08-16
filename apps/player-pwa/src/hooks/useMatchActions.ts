'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';
import { trackEvent } from '@/providers/ObservabilityProvider';

// ─── Toast helper ──────────────────────────────────────

function useToast() {
  return useAppStore((s) => s.showToast);
}

// ─── Join Match ────────────────────────────────────────

export function useJoinMatch() {
  const queryClient = useQueryClient();
  const showToast = useToast();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/join`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      showToast('Successfully joined the match! 🎉', 'success');
    },
    onError: (error) => {
      showToast(
        error.message || 'Failed to join. Please try again.',
        'error'
      );
    },
  });
}

// ─── Leave Match ───────────────────────────────────────

export function useLeaveMatch() {
  const queryClient = useQueryClient();
  const showToast = useToast();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/leave`, { method: 'DELETE' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      showToast('You left the match.', 'info');
    },
    onError: (error) => {
      showToast(
        error.message || 'Failed to leave. Please try again.',
        'error'
      );
    },
  });
}

// ─── Cancel Match (Host) ────────────────────────────────

export function useCancelMatch() {
  const queryClient = useQueryClient();
  const showToast = useToast();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/cancel`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      showToast('Match cancelled. Players will be notified.', 'info');
      trackEvent('match_cancelled', { match_id: matchId });
    },
    onError: (error) => {
      showToast(
        error.message || 'Failed to cancel match.',
        'error'
      );
    },
  });
}

// ─── Start Match (Host: Full → InProgress) ──────────────

export function useStartMatch() {
  const queryClient = useQueryClient();
  const showToast = useToast();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/start`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      showToast('Match started! ⚽', 'success');
    },
    onError: (error) => {
      showToast(
        error.message || 'Failed to start match.',
        'error'
      );
    },
  });
}

// ─── Complete Match (Host: InProgress → Completed) ──────

export function useCompleteMatch() {
  const queryClient = useQueryClient();
  const showToast = useToast();

  return useMutation<unknown, FetchError, string>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/complete`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      queryClient.invalidateQueries({ queryKey: ['pom', matchId] });
      showToast('Match completed! Vote for Player of the Match.', 'success');
    },
    onError: (error) => {
      showToast(
        error.message || 'Failed to complete match.',
        'error'
      );
    },
  });
}
