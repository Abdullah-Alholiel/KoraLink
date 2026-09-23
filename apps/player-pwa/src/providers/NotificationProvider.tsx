'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { getRealtime } from '@/lib/realtime';
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
  const pathname = usePathname();

  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const setNotificationBadge = useAppStore((s) => s.setNotificationBadge);

  // Keep translation + router access inside handlers without re-subscribing
  // the socket on locale/path changes.
  const tRef = useRef(useTranslations('notifications'));
  const t = tRef.current;
  // F3 (2026-09-22): pathname lives in a REF, never in the socket effect's
  // deps. With `pathname` as a dep, EVERY route change disconnected and
  // re-handshaked the app-wide notification socket (JWT verify + a users-row
  // SELECT per navigation) and opened a window where a `notification` event
  // was lost mid-navigation. The toast guard reads the ref instead — same
  // pattern as tRef above.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    // Shared realtime client (Slice 2): the user's personal room is joined
    // server-side on every authenticated connection (gateway handleConnection),
    // so the provider only needs to LISTEN — no room join here.
    const rt = getRealtime();
    rt.connect();

    const onNotification = (payload: NotificationEvent) => {
      trackEvent('notification_delivered', { verb: payload.verb });

      // Absolute count from the server — multi-tab safe.
      setNotificationBadge(payload.unreadCount);

      // Refetch notification-driven data.
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      // Toast — suppressed while the user is already reading that DM thread
      // (reads the pathname REF: the socket effect must not re-subscribe on
      // navigation — F3).
      const inConversation = /\/messages\/[^/]+$/.test(pathnameRef.current ?? '');
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
        player_removed: t('playerRemoved'),
        match_auto_cancelled: t('matchAutoCancelled'),
        report_resolved: t('reportResolved'),
      };
      const message = copy[payload.verb] ?? t('newActivity');
      const href = payload.verb === 'followed'
        ? '/profile'
        : payload.matchId
          ? `/match/${payload.matchId}`
          : '/messages';

      useAppStore.getState().showToast(message, 'notification', { href, avatarUrl: payload.actor?.avatarUrl });
    };
    const offNotification = rt.on('notification', onNotification);

    const offBadgeSync = rt.on('badge-sync', (payload: BadgeSyncEvent) => {
      setNotificationBadge(payload.unreadCount);
    });

    return () => {
      offNotification();
      offBadgeSync();
    };
  }, [isAuthenticated, user?.id, queryClient, setNotificationBadge, t]);

  return <>{children}</>;
}
