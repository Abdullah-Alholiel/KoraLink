'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, Users, UserPlus, UserMinus, MessageSquare, Trophy, ShieldCheck, ShieldAlert, Wallet, XCircle, PauseCircle, Ban, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { FeedItem, ActivityVerb } from '@/hooks/useFeed';
import { formatRelativeTime } from '@/lib/format';

interface ActivityCardProps {
  item: FeedItem;
  locale: 'ar' | 'en';
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
};

const VERB_LABEL: Record<ActivityVerb, string> = {
  created_match: 'feed.createdMatch',
  joined_match: 'feed.joinedMatch',
  followed: 'feed.followedYou',
  messaged: 'feed.messagedYou',
  pom_decided: 'feed.pomDecided',
  dispute_resolved: 'feed.disputeResolved',
  dispute_rejected: 'feed.disputeRejected',
  wallet_refunded: 'feed.walletRefunded',
  match_cancelled_admin: 'feed.matchCancelledAdmin',
  account_suspended: 'feed.accountSuspended',
  account_banned: 'feed.accountBanned',
  account_unbanned: 'feed.accountUnbanned',
  no_show_marked: 'feed.noShowMarked',
  host_underfilled_nudge: 'feed.hostUnderfilledNudge',
  player_removed: 'feed.playerRemoved',
  match_auto_cancelled: 'feed.matchAutoCancelled',
};

export default function ActivityCard({ item, locale }: ActivityCardProps) {
  const t = useTranslations();
  const Icon = VERB_ICON[item.verb] ?? Users;
  const label = t(VERB_LABEL[item.verb], { name: item.actor.name });

  const href = item.match
    ? `/${locale}/match/${item.match.id}`
    : item.verb === 'followed'
      ? `/${locale}/profile`
      : `/${locale}/messages`;

  return (
    <Link
      href={href}
      className="flex items-start gap-3 bg-white rounded-2xl shadow-card mx-4 mb-3 p-4 transition-shadow hover:shadow-card-hover active:scale-[0.99]"
    >
      <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-brand-green" strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-brand-black leading-snug">{label}</p>

        {item.match && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {item.match.title}
            {item.match.venueName ? ` · ${item.match.venueName}` : ''}
          </p>
        )}

        <p className="text-[10px] text-gray-400 mt-1">
          {formatRelativeTime(item.createdAt, locale)}
        </p>
      </div>

      {!item.isRead && (
        <span className="w-2 h-2 rounded-full bg-brand-green flex-shrink-0 mt-1.5" />
      )}
    </Link>
  );
}
