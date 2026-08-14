'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { env } from '@/env.mjs';
import { fetcher, FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';
import type { Match } from '@/types';
import {
  type NearbyMatchApi,
  type MatchDetailApi,
  adaptMatchDetail,
  adaptMatchList,
} from '@/lib/api-adapter';
import { z } from 'zod';
import { trackEvent } from '@/providers/ObservabilityProvider';

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
  visibility: z.enum(['public', 'private']).default('public'),
});

export type HostMatchInput = z.infer<typeof hostMatchSchema>;

// ─── Fetch Nearby Matches ─────────────────────────────

export function useMatches(filters?: {
  date?: string | null;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
  city?: string | null;
  format?: string | null;
  maxPrice?: number | null;
  gender?: string | null;
  venue_id?: string | null;
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
        if (filters.date) params.date = filters.date;
        if (filters.lat != null && filters.lng != null) {
          params.lat = String(filters.lat);
          params.lng = String(filters.lng);
          if (filters.radiusKm != null) params.radius_km = String(filters.radiusKm);
        }
        if (filters.format) params.format = filters.format;
        if (filters.gender) params.gender = filters.gender;
        if (filters.maxPrice != null) params.max_price = String(filters.maxPrice);
        if (filters.venue_id) params.venue_id = filters.venue_id;
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
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!id) return;

    const token = typeof window !== 'undefined'
      ? localStorage.getItem('koralink_token')
      : null;

    const socket: Socket = io(`${env.NEXT_PUBLIC_API_URL ?? ''}/lobby`, {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      socket.emit('join-lobby', { matchId: id });
    });

    const refreshMatchData = () => {
      queryClient.invalidateQueries({ queryKey: ['match', id] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    };

    socket.on('status-update', refreshMatchData);
    socket.on('roster-update', refreshMatchData);
    socket.on('pom-decided', refreshMatchData);

    return () => {
      socket.disconnect();
    };
  }, [id, queryClient]);

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
  const showToast = useAppStore.getState().showToast;

  return useMutation<Match, FetchError, HostMatchInput>({
    mutationFn: async (data) => {
      const raw = await fetcher<MatchDetailApi>('/matches', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return adaptMatchDetail(raw);
    },
    onSuccess: (_match, variables) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      showToast('Match created successfully!', 'success');
      trackEvent('match_created', {
        visibility: variables.visibility ?? 'public',
        booking_mode: variables.booking_mode,
      });
    },
    onError: (err) => {
      showToast(err.message || 'Failed to create match. Please try again.', 'error');
    },
  });
}

// ─── Mark No-Show (Host) ─────────────────────────────

export function useMarkNoShow(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation<Match, Error, { targetUserId: string; noShow: boolean }>({
    mutationFn: async ({ targetUserId, noShow }) => {
      const raw = await fetcher<MatchDetailApi>(`/matches/${matchId}/no-show`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId, noShow }),
      });
      return adaptMatchDetail(raw);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
  });
}
