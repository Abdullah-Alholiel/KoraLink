'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { Match } from '@/types';
import { z } from 'zod';

// ─── API Response Types ──────────────────────────────

interface MatchesResponse {
  matches: Match[];
  total: number;
  hasMore: boolean;
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
});

export type HostMatchInput = z.infer<typeof hostMatchSchema>;

// ─── Fetch Nearby Matches ─────────────────────────────

export function useMatches(filters?: {
  date?: string | null;
  city?: string | null;
  format?: string | null;
  maxPrice?: number | null;
}) {
  return useQuery<MatchesResponse, FetchError>({
    queryKey: ['matches', filters],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value != null) params[key] = String(value);
        }
      }
      return fetcher<MatchesResponse>('/matches', {
        params: Object.keys(params).length > 0 ? params : undefined,
      });
    },
  });
}

// ─── Fetch Single Match ───────────────────────────────

export function useMatch(id: string) {
  return useQuery<Match, FetchError>({
    queryKey: ['match', id],
    queryFn: () => fetcher<Match>(`/matches/${id}`),
    enabled: !!id,
  });
}

// ─── Create Match (Host) ──────────────────────────────

export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation<Match, Error, HostMatchInput>({
    mutationFn: (data) =>
      fetcher<Match>('/matches', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}
