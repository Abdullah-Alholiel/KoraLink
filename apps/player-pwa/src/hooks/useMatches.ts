'use client';

import { useEffect, useMemo } from 'react';
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { createLobbySocket } from '@/lib/socket';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { Match } from '@/types';
import {
  type NearbyMatchApi,
  type MatchDetailApi,
  adaptMatchDetail,
  adaptMatchList,
} from '@/lib/api-adapter';
import { z } from 'zod';
import { trackEvent, captureError } from '@/providers/ObservabilityProvider';

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

// ─── Fetch Nearby Matches (paged — P1-19) ─────────────

export interface UseMatchesResult {
  matches: Match[];
  total?: number;
  hasMore: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  error: FetchError | null;
  refetch: () => void;
  isSuccess: boolean;
  isError: boolean;
}

/** One fetched page of the discovery feed (canonical API envelope). */
interface MatchesPage {
  matches: Match[];
  total?: number;
  hasMore: boolean;
}

const PAGE_SIZE = 50;

export function useMatches(filters?: {
  date?: string | null;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
  city?: string | null;
  format?: string | null;
  maxPrice?: number | null;
  gender?: string | null;
  time?: string | null;
  venue_id?: string | null;
}): UseMatchesResult {
  const query = useInfiniteQuery({
    queryKey: ['matches', filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MatchesPage> => {
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
        if (filters.time) params.time = filters.time;
        if (filters.maxPrice != null) params.max_price = String(filters.maxPrice);
        if (filters.venue_id) params.venue_id = filters.venue_id;
      }
      params.limit = String(PAGE_SIZE);
      if (pageParam > 0) params.offset = String(pageParam);

      const raw = await fetcher<MatchesApiResponse | NearbyMatchApi[]>('/matches', {
        params: Object.keys(params).length > 0 ? params : undefined,
      });

      // Support both wrapped (canonical) and unwrapped (legacy array) shapes.
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
      return {
        matches: adaptMatchList(rows),
        total,
        // Legacy array shape carries no hasMore — never page on it.
        hasMore: hasMore ?? false,
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.reduce((sum, page) => sum + page.matches.length, 0);
    },
    // Keep prior page data visible while the next page loads.
    maxPages: 10,
  });

  const matches = useMemo(
    () => query.data?.pages.flatMap((page) => page.matches) ?? [],
    [query.data],
  );
  const lastPage = query.data?.pages[query.data.pages.length - 1];

  return {
    matches,
    total: lastPage?.total,
    hasMore: Boolean(query.hasNextPage),
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    error: (query.error as FetchError | null) ?? null,
    refetch: () => {
      void query.refetch();
    },
    isSuccess: query.isSuccess,
    isError: query.isError,
  };
}

// ─── Fetch Single Match ───────────────────────────────

export function useMatch(id: string, currentUserId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!id) return;

    const socket: Socket = createLobbySocket(5);

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

  return useMutation<Match, FetchError, HostMatchInput>({
    mutationFn: async (data) => {
      // Enforce the host-match contract before it reaches the API.
      const parsed = hostMatchSchema.parse(data);
      const raw = await fetcher<MatchDetailApi>('/matches', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      return adaptMatchDetail(raw);
    },
    onSuccess: (_match, variables) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'my-matches'] });
      trackEvent('match_created', {
        visibility: variables.visibility ?? 'public',
        booking_mode: variables.booking_mode,
        price_per_player: _match.price,
        pitch_cost_sar: variables.pitchCostSar ?? 0,
        max_players: variables.max_players,
      });
      // No toast here — success is communicated by navigating to the match
      // detail page (router.replace). Toasting AND navigating duplicates UX.
    },
    onError: (err) => {
      // Shown contextually inside the PublishWarningSheet (classified by
      // classifyPublishError in HostMatchForm) — no generic toast.
      captureError(err, { scope: 'createMatch' });
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

// ─── Remove Player (Host, pre-match) ─────────────────

export function useRemovePlayer(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation<Match, Error, { targetUserId: string }>({
    mutationFn: async ({ targetUserId }) => {
      const raw = await fetcher<MatchDetailApi>(
        `/matches/${matchId}/players/${targetUserId}`,
        { method: 'DELETE' },
      );
      return adaptMatchDetail(raw);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    },
  });
}
