'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';
import { trackEvent } from '@/providers/ObservabilityProvider';
import type { Match, RosterPlayer } from '@/types';

// ─── Toast helper ──────────────────────────────────────

function useToast() {
  return useAppStore((s) => s.showToast);
}

// ─── Optimistic update helpers (pure, exported for tests) ──

/** Minimal identity needed to render an optimistic roster entry. */
export interface OptimisticActor {
  id: string;
  fullName: string;
  avatarUrl?: string;
}

/**
 * Optimistically marks a match as joined: flips `isJoined`, bumps `filledSpots`,
 * appends the actor to the roster, and flips `open` → `full` at capacity.
 * Pure — no side effects — so the same logic is unit-testable and reusable by
 * the hook below.
 */
export function optimisticallyJoin(match: Match, actor: OptimisticActor): Match {
  const alreadyInRoster = match.roster.some((p) => p.userId === actor.id);
  if (alreadyInRoster) return { ...match, isJoined: true };

  const filledSpots = match.filledSpots + 1;
  const roster: RosterPlayer[] = [
    ...match.roster,
    {
      id: actor.id,
      userId: actor.id,
      name: actor.fullName || 'You',
      avatarUrl: actor.avatarUrl || '',
      team: null,
      isHost: false,
      noShow: false,
    },
  ];

  return {
    ...match,
    isJoined: true,
    filledSpots,
    roster,
    status:
      match.status === 'open' && filledSpots >= match.totalSpots
        ? 'full'
        : match.status,
  };
}

/**
 * Optimistically marks a match as left: flips `isJoined`, decrements
 * `filledSpots`, removes the actor from the roster, and flips `full` → `open`.
 */
export function optimisticallyLeave(match: Match, userId: string): Match {
  const wasInRoster = match.roster.some((p) => p.userId === userId);
  const filledSpots = wasInRoster ? Math.max(match.filledSpots - 1, 0) : match.filledSpots;

  return {
    ...match,
    isJoined: false,
    filledSpots,
    roster: match.roster.filter((p) => p.userId !== userId),
    status: match.status === 'full' && wasInRoster ? 'open' : match.status,
  };
}

/**
 * The match detail query is keyed `['match', id, { currentUserId }]`; the chat
 * messages query shares the `['match', id]` prefix but is keyed
 * `['match', id, 'messages']` (an array, not a `Match`). This filter isolates
 * the detail query so optimistic updates never clobber the messages list.
 */
function matchDetailFilter(matchId: string) {
  return {
    queryKey: ['match', matchId],
    predicate: (query: { queryKey: readonly unknown[] }) =>
      typeof query.queryKey[2] === 'object' && query.queryKey[2] !== null,
  };
}

/** Snapshot shape captured before an optimistic update, for rollback. */
type DetailSnapshot = [QueryKey, Match | undefined][];

// ─── Join Match ────────────────────────────────────────

export function useJoinMatch() {
  const queryClient = useQueryClient();
  const showToast = useToast();

  return useMutation<unknown, FetchError, string, { snapshot: DetailSnapshot }>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/join`, { method: 'POST' }),
    onMutate: async (matchId) => {
      // Cancel any in-flight detail refetch so it can't overwrite the
      // optimistic state before the server confirms.
      await queryClient.cancelQueries({ queryKey: ['match', matchId] });
      const filter = matchDetailFilter(matchId);
      const snapshot = queryClient.getQueriesData<Match>(filter);
      const actor = useAppStore.getState().user;
      if (actor) {
        queryClient.setQueriesData<Match>(filter, (old) =>
          old && !Array.isArray(old) ? optimisticallyJoin(old, actor) : old,
        );
      }
      return { snapshot };
    },
    onError: (error, _matchId, context) => {
      if (context?.snapshot) {
        for (const [key, data] of context.snapshot) {
          queryClient.setQueryData(key, data);
        }
      }
      showToast(
        error.message || 'Failed to join. Please try again.',
        'error',
      );
    },
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      showToast('Successfully joined the match! 🎉', 'success');
    },
  });
}

// ─── Leave Match ───────────────────────────────────────

export function useLeaveMatch() {
  const queryClient = useQueryClient();
  const showToast = useToast();

  return useMutation<unknown, FetchError, string, { snapshot: DetailSnapshot }>({
    mutationFn: (matchId) =>
      fetcher(`/matches/${matchId}/leave`, { method: 'DELETE' }),
    onMutate: async (matchId) => {
      await queryClient.cancelQueries({ queryKey: ['match', matchId] });
      const filter = matchDetailFilter(matchId);
      const snapshot = queryClient.getQueriesData<Match>(filter);
      const userId = useAppStore.getState().user?.id;
      if (userId) {
        queryClient.setQueriesData<Match>(filter, (old) =>
          old && !Array.isArray(old) ? optimisticallyLeave(old, userId) : old,
        );
      }
      return { snapshot };
    },
    onError: (error, _matchId, context) => {
      if (context?.snapshot) {
        for (const [key, data] of context.snapshot) {
          queryClient.setQueryData(key, data);
        }
      }
      showToast(
        error.message || 'Failed to leave. Please try again.',
        'error',
      );
    },
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      showToast('You left the match.', 'info');
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

// ─── Reschedule Match (Host: moves a koralink match to a new slot) ──────

export interface RescheduleMatchInput {
  matchId: string;
  bookingSlotId: string;
}

export function useRescheduleMatch() {
  const queryClient = useQueryClient();
  const showToast = useToast();

  return useMutation<unknown, FetchError, RescheduleMatchInput>({
    mutationFn: ({ matchId, bookingSlotId }) =>
      fetcher(`/matches/${matchId}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ booking_slot_id: bookingSlotId }),
      }),
    onSuccess: (_, { matchId }) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['pitch-slots'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      showToast('Match rescheduled. Players will be notified.', 'success');
      trackEvent('match_rescheduled', { match_id: matchId });
    },
    onError: (error) => {
      showToast(
        error.message || 'Failed to reschedule match.',
        'error'
      );
    },
  });
}
