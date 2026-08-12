'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MessageSquare, Users } from 'lucide-react';
import type { Discussion } from '@/types';

// ── Helpers ────────────────────────────────────────────────

function formatTime(dateStr: string | null, t: (k: string) => string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('messages.justNow');
  if (diffMins < 60) return `${diffMins} ${t('messages.minutesAgo')}`;
  if (diffHrs < 24) return `${diffHrs} ${t('messages.hoursAgo')}`;
  if (diffDays === 1) return t('messages.yesterday');
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncateMessage(msg: string | null, maxLen = 45): string {
  if (!msg) return '';
  return msg.length > maxLen ? msg.slice(0, maxLen) + '…' : msg;
}

// ── Status styles ──────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  open: { bg: 'bg-brand-green/10', text: 'text-brand-green' },
  full: { bg: 'bg-amber-100', text: 'text-amber-800' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-800' },
  completed: { bg: 'bg-gray-100', text: 'text-gray-400' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-400' },
};

interface DiscussionCardProps {
  discussion: Discussion;
  href: string;
}

export default function DiscussionCard({ discussion, href }: DiscussionCardProps) {
  const t = useTranslations();
  const { title, lastMessage, lastMessageAt, lastMessageSenderName, unreadCount, matchStatus, participantCount, isOnline } = discussion;
  const timeStr = formatTime(lastMessageAt, t);
  const preview = truncateMessage(lastMessage);
  const statusConf = matchStatus ? STATUS_STYLES[matchStatus] ?? STATUS_STYLES.open : null;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/70 active:bg-gray-100 transition-colors"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-green/20 to-brand-green/5 flex items-center justify-center">
          {discussion.avatarUrl ? (
            <img
              src={discussion.avatarUrl}
              alt={title}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-bold text-brand-green">
              {discussion.avatarInitials}
            </span>
          )}
        </div>
        {/* Online indicator */}
        {isOnline && (
          <div className="absolute -bottom-0.5 -end-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
        )}
        {/* Unread badge */}
        {unreadCount > 0 && (
          <div className="absolute -top-1 -end-1 min-w-[18px] h-[18px] bg-brand-green rounded-full flex items-center justify-center px-1">
            <span className="text-[10px] font-bold text-white leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-brand-black truncate">
              {title}
            </h3>
            {discussion.type === 'match' && (
              <MessageSquare className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" strokeWidth={1.5} />
            )}
          </div>
          <span className={`text-[11px] flex-shrink-0 ${unreadCount > 0 ? 'text-brand-green font-semibold' : 'text-gray-400'}`}>
            {timeStr}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`text-xs truncate ${unreadCount > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
            {lastMessageSenderName && (
              <span className="font-semibold text-gray-600">{lastMessageSenderName}: </span>
            )}
            {preview || t('messages.noMessages')}
          </p>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Participant count */}
            {participantCount !== undefined && participantCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                <Users className="w-3 h-3" strokeWidth={1.5} />
                {participantCount}
              </span>
            )}
            {/* Match status badge */}
            {statusConf && matchStatus !== 'open' && matchStatus !== 'completed' && (
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${statusConf.bg} ${statusConf.text}`}>
                {matchStatus === 'in_progress' ? t('messages.live') : matchStatus === 'full' ? t('messages.full') : matchStatus}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
