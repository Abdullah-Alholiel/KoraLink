'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Search,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { useDiscussions } from '@/hooks/useMessages';
import DiscussionCard from '@/components/matches/DiscussionCard';
import type { Discussion } from '@/types';

// ── Group discussions by time category ─────────────────

function groupDiscussions(
  discussions: Discussion[],
  t: (key: string) => string,
): { label: string; items: Discussion[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  const today: Discussion[] = [];
  const yesterday: Discussion[] = [];
  const thisWeek: Discussion[] = [];
  const older: Discussion[] = [];

  for (const d of discussions) {
    const msgDate = d.lastMessageAt ? new Date(d.lastMessageAt) : null;
    if (!msgDate) {
      older.push(d);
    } else if (msgDate >= todayStart) {
      today.push(d);
    } else if (msgDate >= yesterdayStart) {
      yesterday.push(d);
    } else if (msgDate >= weekStart) {
      thisWeek.push(d);
    } else {
      older.push(d);
    }
  }

  const groups: { label: string; items: Discussion[] }[] = [];
  if (today.length) groups.push({ label: t('messages.today'), items: today });
  if (yesterday.length) groups.push({ label: t('messages.yesterday'), items: yesterday });
  if (thisWeek.length) groups.push({ label: t('messages.thisWeek'), items: thisWeek });
  if (older.length) groups.push({ label: t('messages.older'), items: older });

  return groups;
}

// ── Page Component ─────────────────────────────────────

export default function MessagesPage() {
  const t = useTranslations();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/')[1] || 'en';

  const { data: discussions, isLoading, error, refetch } = useDiscussions();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Filter by search
  const filtered = useMemo(() => {
    if (!discussions) return [];
    if (!searchQuery.trim()) return discussions;
    const q = searchQuery.toLowerCase();
    return discussions.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.lastMessage && d.lastMessage.toLowerCase().includes(q)) ||
        (d.lastMessageSenderName && d.lastMessageSenderName.toLowerCase().includes(q)),
    );
  }, [discussions, searchQuery]);

  const groups = useMemo(() => groupDiscussions(filtered, t), [filtered, t]);

  const totalCount = discussions?.length ?? 0;

  return (
    <div className="pb-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">{t('messages.title')}</h1>
          {totalCount > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {totalCount} {t('messages.discussions')}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            setShowSearch(!showSearch);
            if (showSearch) setSearchQuery('');
          }}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 active:scale-95 transition-transform"
          aria-label={t('common.search')}
        >
          <Search
            className={`w-5 h-5 ${showSearch ? 'text-brand-green' : 'text-brand-black'}`}
            strokeWidth={1.5}
          />
        </button>
      </div>

      {/* ── Search Bar ── */}
      {showSearch && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green transition-colors">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search')}
              className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* ── Loading Skeleton ── */}
      {isLoading && (
        <div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-12" />
                </div>
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error State ── */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 px-8">
          <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center mb-3">
            <AlertTriangle className="w-7 h-7 text-brand-red" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-gray-400 text-center mb-4">{t('common.errorDescription')}</p>
          <button
            onClick={() => refetch()}
            className="bg-brand-green text-white px-5 py-2 rounded-full text-sm font-bold active:scale-95 transition-transform"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* ── Empty State ── */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-8">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-bold text-brand-black mb-1">
            {searchQuery ? t('common.noResults') : t('messages.noDiscussions')}
          </h3>
          <p className="text-sm text-gray-400 text-center">
            {searchQuery
              ? t('common.noResults')
              : t('messages.noDiscussionsDescription')}
          </p>
        </div>
      )}

      {/* ── Populated: grouped discussion cards ── */}
      {!isLoading && !error && groups.map((group) => (
        <div key={group.label} className="mb-1">
          {/* Section header */}
          <div className="px-5 pt-4 pb-1.5">
            <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
              {group.label}
            </p>
          </div>

          {/* Discussion cards */}
          <div className="divide-y divide-gray-50">
            {group.items.map((discussion) => {
              // Determine link target
              const href =
                discussion.type === 'match'
                  ? `/${locale}/match/${discussion.id}?chat=open`
                  : `/${locale}/messages/${discussion.id}`;

              return (
                <DiscussionCard
                  key={discussion.id}
                  discussion={discussion}
                  href={href}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* If data loaded, show bottom padding for scroll comfort */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="h-4" />
      )}
    </div>
  );
}
