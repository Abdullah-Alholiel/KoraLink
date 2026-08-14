'use client';

import { useEffect } from 'react';
import { useUnreadNotificationCount } from '@/hooks/useNotificationsFeed';
import { useConversations } from '@/hooks/useConversations';
import { useAppStore } from '@/store/useAppStore';

/**
 * Keeps the Zustand badge counters in sync with the server on mount and on
 * window refocus (absolute values — multi-tab safe):
 * - notificationBadge ← GET /users/me/notifications/unread-count
 * - messagesBadge ← Σ conversations.unreadCount (WS-invalidated via
 *   ['conversations'] refetch in NotificationProvider)
 */
export default function BadgeHydrator() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const setNotificationBadge = useAppStore((s) => s.setNotificationBadge);
  const setMessagesBadge = useAppStore((s) => s.setMessagesBadge);

  const { data } = useUnreadNotificationCount(isAuthenticated);
  const { data: conversations } = useConversations();

  useEffect(() => {
    if (data && data.unreadCount !== useAppStore.getState().notificationBadge) {
      setNotificationBadge(data.unreadCount);
    }
  }, [data, setNotificationBadge]);

  useEffect(() => {
    if (!conversations) return;
    const sum = conversations.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);
    if (sum !== useAppStore.getState().messagesBadge) {
      setMessagesBadge(sum);
    }
  }, [conversations, setMessagesBadge]);

  return null;
}
