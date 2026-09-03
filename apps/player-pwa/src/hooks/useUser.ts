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
  no_show_count: number;
  pom_count: number;
  home_lat: number | null;
  home_lng: number | null;
  created_at: string;
}

interface UserStatsApi {
  games_played: number;
  karma_score: number;
  no_show_count: number;
}

export interface PublicProfileApi {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  preferred_position: string | null;
  skill_level: string | null;
  pom_count: number;
  games_played: number;
  isFollowing: boolean;
  followersCount: number;
  followingCount: number;
}

// ─── Fetch User Profile ────────────────────────────────

export function useUserProfile() {
  return useQuery<UserProfileApi, FetchError>({
    queryKey: ['user', 'profile'],
    queryFn: () => fetcher<UserProfileApi>('/users/me'),
    staleTime: 60_000,
    retry: false,
  });
}

// ─── Push Delivery Preferences (P1-20) ─────────────────

export interface PushCategoryMutes {
  match: boolean;
  chat: boolean;
  promo: boolean;
  system: boolean;
}

export interface PushPreferences {
  push_muted: boolean;
  quiet_hours_enabled: boolean;
  quiet_start_hour: number;
  quiet_end_hour: number;
  // P0-5 (run #28): per-category mutes returned by the API. The 4 keys are
  // always present; `false` means the category is allowed.
  category_mutes: PushCategoryMutes;
}

/** PATCH body — camelCase, matching UpdatePushPreferencesDto on the API. */
export type PushPreferencesInput = Partial<{
  pushMuted: boolean;
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  // P0-5 (run #28): each category key is itself optional — sending a
  // partial subset leaves the other categories' stored values untouched.
  categoryMutes: Partial<PushCategoryMutes>;
}>;

export function useUpdatePushPreferences() {
  const queryClient = useQueryClient();

  return useMutation<PushPreferences, FetchError, PushPreferencesInput>({
    mutationFn: (data) =>
      fetcher<PushPreferences>('/users/me/push-preferences', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (prefs) => {
      // Write-through: the profile query feeds the preferences UI.
      queryClient.setQueryData<Record<string, unknown>>(
        ['user', 'profile'],
        (old) => (old ? { ...old, ...prefs } : old),
      );
    },
  });
}

// ─── Fetch Public Profile ──────────────────────────────

export function usePublicProfile(userId: string) {
  return useQuery<PublicProfileApi, FetchError>({
    queryKey: ['user', 'public', userId],
    queryFn: () => fetcher<PublicProfileApi>(`/users/${userId}`),
    enabled: !!userId,
    staleTime: 120_000,
  });
}

// ─── Fetch User Stats ──────────────────────────────────

export function useUserStats() {
  return useQuery<UserStatsApi, FetchError>({
    queryKey: ['user', 'stats'],
    queryFn: () => fetcher<UserStatsApi>('/users/me/stats'),
    staleTime: 120_000,
    retry: false,
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
  home_lat?: number;
  home_lng?: number;
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
    retry: false,
  });
}

// ─── Search Users ──────────────────────────────────────

export interface SearchUserApi {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  preferred_position: string | null;
  skill_level: string | null;
}

export function useSearchUsers(query: string) {
  return useQuery<SearchUserApi[], FetchError>({
    queryKey: ['users', 'search', query],
    queryFn: () => fetcher<SearchUserApi[]>(`/users/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}

// ─── P0-6 (run #29): PDPL account-delete + restore + data-export ──

export interface SoftDeleteResult {
  deleted_at: string;
  purge_at: string;
  restore_token: string;
}

/**
 * POST /users/me (DELETE) — soft-delete. Returns the deletion timestamp,
 * the scheduled hard-purge date, and a `restore_token` (a JWT with
 * `purpose: 'restore'`). The PWA persists the token in localStorage
 * (separate from the main auth token) and shows a banner with a
 * "Restore" affordance during the 30-day grace window.
 *
 * On success, the page navigates to /login. The user is signed out
 * client-side (Zustand cleared) and the deleted user can no longer
 * authenticate via the strategy or verifyOtp.
 */
export function useSoftDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation<SoftDeleteResult, FetchError, void>({
    mutationFn: () =>
      fetcher<SoftDeleteResult>('/users/me', { method: 'DELETE' }),
    onSuccess: (data) => {
      // Persist the restore token separately so a future /login flow
      // can offer "Restore my account" if the user comes back.
      if (typeof window !== 'undefined' && data?.restore_token) {
        localStorage.setItem('koralink_pdpl_restore_token', data.restore_token);
        localStorage.setItem('koralink_pdpl_purge_at', data.purge_at);
        localStorage.setItem('koralink_pdpl_deleted_at', data.deleted_at);
      }
      // Invalidate the profile query — the next /users/me call will 401
      // (strategy rejects deleted users), but invalidating is the right
      // shape so any cached profile UI is dropped.
      queryClient.removeQueries({ queryKey: ['user', 'profile'] });
    },
  });
}

/**
 * POST /users/me/restore — restore within the 30-day grace. Idempotent
 * on an active user (returns the profile). Clears the persisted
 * restore-token + dates from localStorage on success.
 */
export function useRestoreAccount() {
  const queryClient = useQueryClient();
  return useMutation<UserProfileApi, FetchError, void>({
    mutationFn: () =>
      fetcher<UserProfileApi>('/users/me/restore', { method: 'POST' }),
    onSuccess: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('koralink_pdpl_restore_token');
        localStorage.removeItem('koralink_pdpl_purge_at');
        localStorage.removeItem('koralink_pdpl_deleted_at');
      }
      queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
    },
  });
}

/**
 * GET /users/me/export — JSON envelope of 8 data groups. The fetcher
 * sees the Content-Disposition: attachment header and returns the
 * response body as JSON. The PWA converts the JSON to a Blob and
 * triggers a download (see lib/download.ts).
 */
export interface UserExportData {
  exportedAt: string;
  schemaVersion: number;
  profile: Record<string, unknown>;
  matches: {
    joined: Array<Record<string, unknown>>;
    hosted: Array<Record<string, unknown>>;
  };
  wallet: { balance: string };
  transactions: Array<Record<string, unknown>>;
  disputes: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
  push_subscriptions: Array<Record<string, unknown>>;
}

export function useExportMyData() {
  return useMutation<UserExportData, FetchError, void>({
    mutationFn: () => fetcher<UserExportData>('/users/me/export'),
  });
}
