'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, Users, UserPlus, UserMinus, MessageSquare, Trophy, ShieldCheck, ShieldAlert, Wallet, XCircle, PauseCircle, Ban, AlertTriangle, Flag, CalendarClock, type LucideIcon } from 'lucide-react';
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
  report_resolved: Flag,
  // ── Waitlist lifecycle + reschedule (run #201: labels were missing → blank rows) ──
  waitlist_promoted: Trophy,
  waitlist_removed: XCircle,
  match_rescheduled: CalendarClock,
  // ── Partner money flows (P1-67, run #141) ──
  payout_paid: Wallet,
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
  report_resolved: 'feed.reportResolved',
  // ── Waitlist lifecycle + reschedule (run #201) ──
  waitlist_promoted: 'feed.waitlistPromoted',
  waitlist_removed: 'feed.waitlistRemoved',
  match_rescheduled: 'feed.matchRescheduled',
  payout_paid: 'feed.payoutPaid',
};

export default function ActivityCard({ item, locale }: ActivityCardProps) {
  const t = useTranslations();
  const Icon = VERB_ICON[item.verb] ?? Users;
  // `title` must ride EVERY label call: the waitlist/reschedule verbs
  // (run #201) interpolate {title} — PR-Agent r3 on PR #240 caught the
  // feed card passing only {name}, which would render the placeholder
  // unfilled (NotificationSheet already passes both).
  const label = t(VERB_LABEL[item.verb], {
    // System actors (purge sweep, moderation) can carry a null actor —
    // fall back to the app name instead of crashing the row (same guard
    // as NotificationSheet, Reviewer A minor run #40).
    name: item.actor?.name ?? 'KoraLink',
    title: item.match?.title ?? '',
  });

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
