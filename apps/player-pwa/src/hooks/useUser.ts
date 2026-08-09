'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

// ─── API Response Types ──────────────────────────────

export interface UserProfile {
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

export interface UserStats {
  games_played: number;
  rating: number;
  karma_score: number;
  no_show_count: number;
}

// ─── Fetch My Profile ────────────────────────────────

export function useUserProfile() {
  return useQuery<UserProfile, FetchError>({
    queryKey: ['user', 'me'],
    queryFn: () => fetcher<UserProfile>('/users/me'),
  });
}

// ─── Fetch My Stats ──────────────────────────────────

export function useUserStats() {
  return useQuery<UserStats, FetchError>({
    queryKey: ['user', 'me', 'stats'],
    queryFn: () => fetcher<UserStats>('/users/me/stats'),
  });
}

// ─── Update My Profile ───────────────────────────────

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation<UserProfile, Error, Partial<UserProfile>>({
    mutationFn: (data) =>
      fetcher<UserProfile>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
    },
  });
}
