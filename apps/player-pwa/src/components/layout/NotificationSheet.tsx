'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  Bell,
  Plus,
  Users,
  UserPlus,
  UserMinus,
  MessageSquare,
  Trophy,
  CheckCheck,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  XCircle,
  PauseCircle,
  Ban,
  Flag,
  type LucideIcon,
} from 'lucide-react';
import { useNotificationsFeed, useMarkNotificationsRead } from '@/hooks/useNotificationsFeed';
import { useAppStore } from '@/store/useAppStore';
import type { ActivityVerb } from '@/hooks/useFeed';
import { formatRelativeTime } from '@/lib/format';
import { trackEvent } from '@/providers/ObservabilityProvider';
import BottomSheet from '@/components/layout/BottomSheet';

interface NotificationSheetProps {
  open: boolean;
  onClose: () => void;
}

const VERB_ICON: Record<ActivityVerb, LucideIcon> = {
  created_match: Plus,
  joined_match: Users,
  followed: UserPlus,
  messaged: MessageSquare,
  pom_decided: Trophy,
  dispute_resolved: ShieldCheck,
  dispute_rejected: ShieldAlert,
  wallet_refunded: Wallet,
  match_cancelled_admin: XCircle,
  account_suspended: PauseCircle,
  account_banned: Ban,
  account_unbanned: ShieldCheck,
  no_show_marked: AlertTriangle,
  host_underfilled_nudge: UserPlus,
  player_removed: UserMinus,
  match_auto_cancelled: XCircle,
  report_resolved: Flag,
};

const VERB_LABEL: Record<ActivityVerb, string> = {
  created_match: 'notifications.createdMatch',
  joined_match: 'notifications.joinedYourMatch',
  followed: 'notifications.followedYou',
  messaged: 'notifications.messagedYou',
  pom_decided: 'notifications.pomDecided',
  dispute_resolved: 'notifications.disputeResolved',
  dispute_rejected: 'notifications.disputeRejected',
  wallet_refunded: 'notifications.walletRefunded',
  match_cancelled_admin: 'notifications.matchCancelledAdmin',
  account_suspended: 'notifications.accountSuspended',
  account_banned: 'notifications.accountBanned',
  account_unbanned: 'notifications.accountUnbanned',
  no_show_marked: 'notifications.noShowMarked',
  host_underfilled_nudge: 'notifications.hostUnderfilledNudge',
  player_removed: 'notifications.playerRemoved',
  match_auto_cancelled: 'notifications.matchAutoCancelled',
  report_resolved: 'notifications.reportResolved',
};

/**
 * Notification center bottom sheet (US6) — all 5 UX states, z-[60]/z-[70]
 * per bottom-sheet standards, mark-all-read, deep-link rows.
 */
export default function NotificationSheet({ open, onClose }: NotificationSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const setNotificationBadge = useAppStore((s) => s.setNotificationBadge);
  const { data, isLoading, isError, refetch } = useNotificationsFeed();
  const markRead = useMarkNotificationsRead();

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Hydrate the bell badge from the server whenever the sheet opens.
  useEffect(() => {
    if (open) {
      trackEvent('notification_sheet_opened');
      refetch();
    }
  }, [open, refetch]);

  if (!open) return null;

  const items = data?.items ?? [];
  const unreadCount = items.filter((i) => !i.isRead).length;

  const handleMarkAllRead = () => {
    setNotificationBadge(0); // optimistic
    markRead.mutate({ all: true });
  };

  const itemHref = (verb: ActivityVerb, matchId: string | null) => {
    if (matchId) return `/${locale}/match/${matchId}`;
    if (verb === 'followed') return `/${locale}/profile`;
    return `/${locale}/messages`;
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeightClass="max-h-[85dvh]" widthClass="max-w-md">
        {/* Pull handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-brand-black">
            {t('notifications.title')}
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markRead.isPending}
              className="flex items-center gap-1 text-xs font-semibold text-brand-green active:scale-95 transition-transform disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" strokeWidth={2} />
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>

        {/* Body — 5 UX states */}
        <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-4 py-3">
          {/* 1. Loading */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-3 p-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 2. Error */}
          {isError && !isLoading && (
            <div className="flex flex-col items-center justify-center py-14 px-6">
              <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center mb-3">
                <AlertTriangle className="w-7 h-7 text-brand-red" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-bold text-brand-black">{t('common.error')}</p>
              <button
                onClick={() => refetch()}
                className="mt-4 bg-brand-green text-white px-6 py-2.5 rounded-full text-sm font-bold active:scale-95 transition-transform"
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {/* 3. Empty */}
          {!isLoading && !isError && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 px-6">
              <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center mb-3">
                <Bell className="w-7 h-7 text-brand-green" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-bold text-brand-black">{t('notifications.empty')}</p>
              <p className="text-xs text-gray-400 text-center mt-1">
                {t('notifications.emptyDescription')}
              </p>
            </div>
          )}

          {/* 4. Populated */}
          {!isLoading && !isError && items.length > 0 && (
            <div className="divide-y divide-gray-50">
              {items.map((item) => {
                const Icon = VERB_ICON[item.verb] ?? Bell;
                return (
                  <Link
                    key={item.id}
                    href={itemHref(item.verb, item.match?.id ?? null)}
                    onClick={() => {
                      trackEvent('notification_opened', { verb: item.verb });
                      onClose();
                    }}
                    className={`flex items-start gap-3 py-3 px-2 rounded-xl transition-colors ${
                      item.isRead ? 'bg-white' : 'bg-brand-green/5'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        item.isRead ? 'bg-gray-100' : 'bg-brand-green/15'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${item.isRead ? 'text-gray-400' : 'text-brand-green'}`}
                        strokeWidth={2}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-brand-black leading-snug">
                        {t(VERB_LABEL[item.verb], {
                          name: item.actor.name,
                          title: item.match?.title ?? '',
                        })}
                      </p>
                      {item.match?.venueName && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {item.match.venueName}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {formatRelativeTime(item.createdAt, locale === 'ar' ? 'ar' : 'en')}
                      </p>
                    </div>
                    {!item.isRead && (
                      <span className="w-2 h-2 rounded-full bg-brand-green flex-shrink-0 mt-2" />
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
    </BottomSheet>
  );
}
