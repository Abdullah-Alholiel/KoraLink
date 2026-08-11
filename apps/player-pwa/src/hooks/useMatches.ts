'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { Match } from '@/types';
import {
  type NearbyMatchApi,
  type MatchDetailApi,
  adaptMatchDetail,
  adaptMatchList,
} from '@/lib/api-adapter';
import { z } from 'zod';

// ─── API Response Types (snake_case raw) ──────────────

interface MatchesApiResponse {
  matches?: NearbyMatchApi[];
  data?: NearbyMatchApi[];
  total?: number;
  hasMore?: boolean;
}

// ─── Zod Schema (matches backend CreateMatchDto) ──────

export const hostMatchSchema = z.object({
  pitch_id: z.string().min(1, 'Venue / pitch is required'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  match_type: z.enum(['Casual', 'Competitive']),
  gender_rule: z.enum(['Men Only', 'Women Only', 'Mixed']),
  scheduled_at: z.string().min(1, 'Date and time are required'),
  duration_mins: z.number().int().min(30).max(180).default(60),
  max_players: z.number().int().min(2).max(22).default(14),
  pitchCostSar: z.number().min(0).default(0),
  booking_mode: z.enum(['koralink', 'self']).default('self'),
  booking_slot_id: z.string().min(1).optional(),
});

export type HostMatchInput = z.infer<typeof hostMatchSchema>;

// ─── Fetch Nearby Matches ─────────────────────────────

export function useMatches(filters?: {
  date?: string | null;
  city?: string | null;
  format?: string | null;
  maxPrice?: number | null;
}) {
  return useQuery<{
    matches: Match[];
    total?: number;
    hasMore?: boolean;
  }, FetchError>({
    queryKey: ['matches', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value != null) params[key] = String(value);
        }
      }
      const raw = await fetcher<MatchesApiResponse | NearbyMatchApi[]>('/matches', {
        params: Object.keys(params).length > 0 ? params : undefined,
      });

      // Support both wrapped and unwrapped API responses
      let rows: NearbyMatchApi[];
      if (Array.isArray(raw)) {
        rows = raw;
      } else if (raw.matches) {
        rows = raw.matches;
      } else if (raw.data) {
        rows = raw.data;
      } else {
        rows = [];
      }

      const { total, hasMore } = !Array.isArray(raw) ? raw : {};
      return { matches: adaptMatchList(rows), total, hasMore };
    },
  });
}

// ─── Fetch Single Match ───────────────────────────────

export function useMatch(id: string, currentUserId?: string) {
  return useQuery<Match, FetchError>({
    // Include currentUserId in the key so React Query re-fetches
    // when AuthBootstrap populates Zustand (cold page loads).
    queryKey: ['match', id, { currentUserId }],
    queryFn: async () => {
      const raw = await fetcher<MatchDetailApi>(`/matches/${id}`);
      return adaptMatchDetail(raw, currentUserId);
    },
    enabled: !!id,
  });
}

// ─── Fetch Match Messages ─────────────────────────────

export function useMatchMessages(matchId: string) {
  return useQuery<import('@/lib/api-adapter').MatchMessageApi[], FetchError>({
    queryKey: ['match', matchId, 'messages'],
    queryFn: () =>
      fetcher<import('@/lib/api-adapter').MatchMessageApi[]>(
        `/matches/${matchId}/messages`,
      ),
    enabled: !!matchId,
    staleTime: 15_000,
  });
}

// ─── Create Match (Host) ──────────────────────────────

export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation<Match, Error, HostMatchInput>({
    mutationFn: async (data) => {
      const raw = await fetcher<MatchDetailApi>('/matches', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return adaptMatchDetail(raw);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}
