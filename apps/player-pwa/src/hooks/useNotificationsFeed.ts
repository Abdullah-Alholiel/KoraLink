'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher } from '@/lib/fetcher';
import type { FeedItem } from '@/hooks/useFeed';

export interface NotificationsFeedResponse {
  items: FeedItem[];
  total: number;
  hasMore: boolean;
}

/** Directed notifications for the bell sheet (US6). */
export function useNotificationsFeed() {
  return useQuery<NotificationsFeedResponse>({
    queryKey: ['notifications'],
    queryFn: () => fetcher<NotificationsFeedResponse>('/users/me/notifications'),
    staleTime: 30_000,
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
