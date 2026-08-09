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

// ─── Zod Schema ──────────────────────────────────────

export const hostMatchSchema = z.object({
  venueId: z.string().min(1, 'Venue is required'),
  format: z.enum(['5v5', '6v6', '7v7', '8v8', '9v9']),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  isPublic: z.boolean().default(true),
  bookingMode: z.enum(['koralink', 'self']).default('self'),
  price: z.number().min(0).default(0),
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
