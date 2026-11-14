'use client';

import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { fetcher } from '@/lib/fetcher';
import { listRefetchInterval, deepestPageParam } from '@/lib/query-schedule';
import type { FeedItem } from '@/hooks/useFeed';

export interface NotificationsFeedResponse {
  items: FeedItem[];
  total: number;
  hasMore: boolean;
}

/** Page size for the bell sheet (server clamps perPage to 1..100). */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * Directed notifications for the bell sheet (US6), paged with "Load more"
 * (P2-352) so notifications beyond the first page stay reachable.
 */
export function useNotificationsFeed() {
  return useInfiniteQuery<
    NotificationsFeedResponse,
    Error,
    InfiniteData<NotificationsFeedResponse, number>,
    readonly ['notifications', 'infinite'],
    number
  >({
    queryKey: ['notifications', 'infinite'] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetcher<NotificationsFeedResponse>(
        `/users/me/notifications?page=${pageParam}&perPage=${NOTIFICATIONS_PAGE_SIZE}`,
      ),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
    staleTime: 30_000,
    // Freshness poll (P2-135 completion, run #93) — same policy as the home
    // feed/notification list (PR #58): 45s, paused while fetching / tab
    // hidden. Page-1-only guard: once "Load more" has fetched page 2+, the
    // poll stops so an interval refetch never re-fetches every loaded page.
    // The unread-count query is deliberately NOT polled — it already
    // refreshes on focus + WS badge-sync invalidation.
    refetchInterval: ({ state }) =>
      listRefetchInterval({
        isFetching: state.fetchStatus === 'fetching',
        pageParam: deepestPageParam(state.data),
      }),
  });
}

/** Absolute unread count — hydrates the badge on mount and refocus (US6). */
export function useUnreadNotificationCount(enabled = true) {
  return useQuery<{ unreadCount: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => fetcher<{ unreadCount: number }>('/users/me/notifications/unread-count'),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Mark-all-read / mark-read mutation (US6). */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, Error, { all?: boolean; ids?: string[] }>({
    mutationFn: (body) =>
      fetcher<{ updated: number }>('/users/me/notifications/read', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
