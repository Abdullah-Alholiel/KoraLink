'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { useTranslations } from 'next-intl';
import { createLobbySocket } from '@/lib/socket';
import { useAppStore } from '@/store/useAppStore';
import { trackEvent } from '@/providers/ObservabilityProvider';

/** WS payload pushed by ActivitiesService.record() fan-out. */
interface NotificationEvent {
  id: string;
  verb: string;
  createdAt: string;
  actor: { id: string; name: string | null; avatarUrl: string | null } | null;
  matchId: string | null;
  unreadCount: number;
}

interface BadgeSyncEvent {
  unreadCount: number;
}

/**
 * App-wide realtime provider (US6/US7):
 * - one shared /lobby socket per session (auth token, auto-reconnect)
 * - every authenticated socket joins `user:<id>` server-side on connect
 * - `notification` → absolute badge update + cache invalidation + toast
 * - `badge-sync` → absolute badge convergence (e.g. markRead elsewhere)
 *
 * Mounted only for authenticated users — see (main)/layout.tsx.
 */
export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const socketRef = useRef<Socket | null>(null);

  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const setNotificationBadge = useAppStore((s) => s.setNotificationBadge);

  // Keep translation + router access inside handlers without re-subscribing
  // the socket on locale/path changes.
  const tRef = useRef(useTranslations('notifications'));
  const t = tRef.current;

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const socket: Socket = createLobbySocket(10);
    socketRef.current = socket;

    socket.on('notification', (payload: NotificationEvent) => {
      trackEvent('notification_delivered', { verb: payload.verb });

      // Absolute count from the server — multi-tab safe.
      setNotificationBadge(payload.unreadCount);

      // Refetch notification-driven data.
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      // Toast — suppressed while the user is already reading that DM thread.
      const inConversation = /\/messages\/[^/]+$/.test(pathname ?? '');
      if (payload.verb === 'messaged' && inConversation) return;

      const actorName = payload.actor?.name ?? '';
      const copy: Record<string, string> = {
        followed: t('followedYou', { name: actorName }),
        messaged: t('messagedYou', { name: actorName }),
        pom_decided: t('pomDecidedTitle'),
        joined_match: t('joinedYourMatch', { name: actorName }),
        created_match: t('createdMatchTitle', { name: actorName }),
        // ── Admin/ops → player ──
        dispute_resolved: t('disputeResolved'),
        dispute_rejected: t('disputeRejected'),
        wallet_refunded: t('walletRefunded'),
        match_cancelled_admin: t('matchCancelledAdmin'),
        account_suspended: t('accountSuspended'),
        account_banned: t('accountBanned'),
        account_unbanned: t('accountUnbanned'),
        no_show_marked: t('noShowMarked'),
        host_underfilled_nudge: t('hostUnderfilledNudge'),
        match_auto_cancelled: t('matchAutoCancelled'),
      };
      const message = copy[payload.verb] ?? t('newActivity');
      const href = payload.verb === 'followed'
        ? '/profile'
        : payload.matchId
          ? `/match/${payload.matchId}`
          : '/messages';

      useAppStore.getState().showToast(message, 'notification', { href, avatarUrl: payload.actor?.avatarUrl });
    });

    socket.on('badge-sync', (payload: BadgeSyncEvent) => {
      setNotificationBadge(payload.unreadCount);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, user?.id, queryClient, setNotificationBadge, pathname, t, router]);

  return <>{children}</>;
}
