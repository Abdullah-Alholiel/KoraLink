'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

// ─── API Response Types ────────────────────────────────

export interface UserProfileApi {
  id: string;
  phone: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  preferred_location: string | null;
  preferred_position: string | null;
  skill_level: string | null;
  role: string;
  wallet_balance: string;
  karma_score: number;
  rating: number;
  no_show_count: number;
  created_at: string;
}

interface UserStatsApi {
  games_played: number;
  rating: number;
  karma_score: number;
  no_show_count: number;
}

// ─── Fetch User Profile ────────────────────────────────

export function useUserProfile() {
  return useQuery<UserProfileApi, FetchError>({
    queryKey: ['user', 'profile'],
    queryFn: () => fetcher<UserProfileApi>('/users/me'),
    staleTime: 60_000,
  });
}

// ─── Fetch User Stats ──────────────────────────────────

export function useUserStats() {
  return useQuery<UserStatsApi, FetchError>({
    queryKey: ['user', 'stats'],
    queryFn: () => fetcher<UserStatsApi>('/users/me/stats'),
    staleTime: 120_000,
  });
}

// ─── Update User Profile ───────────────────────────────

interface UpdateProfileInput {
  full_name?: string;
  handle?: string;
  avatar_url?: string;
  skill_level?: 'Beginner' | 'Intermediate' | 'Advanced';
  preferred_location?: string;
  preferred_position?: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation<UserProfileApi, FetchError, UpdateProfileInput>({
    mutationFn: (data) =>
      fetcher<UserProfileApi>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
    },
  });
}

// ─── Fetch My Matches ──────────────────────────────────

export function useMyMatches() {
  return useQuery<import('@/lib/api-adapter').NearbyMatchApi[], FetchError>({
    queryKey: ['user', 'my-matches'],
    queryFn: () => fetcher<import('@/lib/api-adapter').NearbyMatchApi[]>('/users/me/matches'),
    staleTime: 30_000,
  });
}
