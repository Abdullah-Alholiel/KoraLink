'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

export type ActivityVerb =
  | 'created_match'
  | 'joined_match'
  | 'followed'
  | 'messaged'
  | 'pom_decided'
  // ── Admin/ops → player ──
  | 'dispute_resolved'
  | 'dispute_rejected'
  | 'wallet_refunded'
  | 'match_cancelled_admin'
  | 'account_suspended'
  | 'account_banned'
  | 'account_unbanned'
  | 'no_show_marked'
  | 'host_underfilled_nudge'
  | 'player_removed'
  | 'match_auto_cancelled'
  | 'report_resolved';

export interface FeedItem {
  id: string;
  verb: ActivityVerb;
  actor: { id: string; name: string; handle: string | null; avatarUrl: string | null };
  match: { id: string; title: string; venueName: string | null; scheduledAt: string | null } | null;
  subjectUserId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface FeedApiResponse {
  items: FeedItem[];
  total: number;
  hasMore: boolean;
}

/** Activity feed (most relevant first — recency + social proximity). */
export function useFeed() {
  return useQuery<FeedApiResponse, FetchError>({
    queryKey: ['feed'],
    queryFn: () => fetcher<FeedApiResponse>('/users/me/feed'),
    staleTime: 30_000,
  });
}

/** Notifications directed at the user (followed/messaged/pom/joined-my-match). */
export function useNotifications() {
  return useQuery<FeedApiResponse, FetchError>({
    queryKey: ['notifications'],
    queryFn: () => fetcher<FeedApiResponse>('/users/me/notifications'),
    staleTime: 30_000,
  });
}
