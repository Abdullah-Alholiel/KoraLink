'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

export interface FollowState {
  following: boolean;
  followersCount: number;
  followingCount: number;
}

export interface UserSummary {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  preferred_position: string | null;
  skill_level: string | null;
}

interface PublicProfileShape {
  isFollowing: boolean;
  followersCount: number;
  followingCount: number;
}

/**
 * Follow state + toggle for a target user. Reads isFollowing/counts from the
 * public profile and updates the React Query cache directly on mutation
 * success (no refetch needed — the mutation returns the new counts).
 */
export function useFollow(targetUserId: string) {
  const queryClient = useQueryClient();
  const cacheKey = ['user', 'public', targetUserId];

  const profile = useQuery<PublicProfileShape, FetchError>({
    queryKey: cacheKey,
    queryFn: () => fetcher<PublicProfileShape>(`/users/${targetUserId}`),
    enabled: !!targetUserId,
    staleTime: 60_000,
  });

  const followMutation = useMutation<FollowState, FetchError, void>({
    mutationFn: () => fetcher<FollowState>(`/users/${targetUserId}/follow`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData<PublicProfileShape>(cacheKey, (old) => ({
        ...old,
        isFollowing: data.following,
        followersCount: data.followersCount,
        followingCount: data.followingCount,
      }));
      queryClient.invalidateQueries({ queryKey: ['user', 'me', 'following'] });
    },
  });

  const unfollowMutation = useMutation<FollowState, FetchError, void>({
    mutationFn: () => fetcher<FollowState>(`/users/${targetUserId}/follow`, { method: 'DELETE' }),
    onSuccess: (data) => {
      queryClient.setQueryData<PublicProfileShape>(cacheKey, (old) => ({
        ...old,
        isFollowing: data.following,
        followersCount: data.followersCount,
        followingCount: data.followingCount,
      }));
      queryClient.invalidateQueries({ queryKey: ['user', 'me', 'following'] });
    },
  });

  return {
    isFollowing: profile.data?.isFollowing ?? false,
    followersCount: profile.data?.followersCount ?? 0,
    followingCount: profile.data?.followingCount ?? 0,
    isLoading: profile.isLoading,
    follow: () => followMutation.mutate(),
    unfollow: () => unfollowMutation.mutate(),
    isPending: followMutation.isPending || unfollowMutation.isPending,
  };
}

export function useFollowers() {
  return useQuery<{ users: UserSummary[]; total: number }, FetchError>({
    queryKey: ['user', 'me', 'followers'],
    queryFn: () => fetcher('/users/me/followers'),
  });
}

export function useFollowing() {
  return useQuery<{ users: UserSummary[]; total: number }, FetchError>({
    queryKey: ['user', 'me', 'following'],
    queryFn: () => fetcher('/users/me/following'),
  });
}
