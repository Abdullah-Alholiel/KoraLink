'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, WifiOff, Rss, ArrowUp } from 'lucide-react';
import { useFeed } from '@/hooks/useFeed';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import ActivityCard from '@/components/feed/ActivityCard';
import NotificationBell from '@/components/layout/NotificationBell';
import PullToRefresh from '@/components/feed/PullToRefresh';

const LAST_SEEN_KEY = 'koralink_feed_last_seen';

export default function CommunityFeedPage() {
  const t = useTranslations('feed');
  const tc = useTranslations('common');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useFeed();
  const isOnline = useOnlineStatus();

  const items = useMemo(() => data?.items ?? [], [data]);

  /* ── Unread divider: items newer than the last visit are tinted ── */
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    // SSR-safe: read localStorage only after mount.
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LAST_SEEN_KEY) : null;
    setLastSeenAt(raw ? Number(raw) : null);
    hydrated.current = true;
  }, []);

  // When the page is backgrounded/hidden, stamp the last-seen time.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && hydrated.current) {
        const now = Date.now();
        localStorage.setItem(LAST_SEEN_KEY, String(now));
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const isNew = useMemo(() => {
    if (lastSeenAt == null) return () => false;
    return (iso: string) => new Date(iso).getTime() > lastSeenAt;
  }, [lastSeenAt]);

  /* ── "New activities" pill: appears when fresh items land while open ── */
  const knownTopId = useRef<string | null>(null);
  const [hasNewAbove, setHasNewAbove] = useState(false);

  useEffect(() => {
    if (!items.length) return;
    const topId = items[0].id;
    if (knownTopId.current === null) {
      knownTopId.current = topId;
    } else if (topId !== knownTopId.current) {
      setHasNewAbove(true);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToTop = () => {
    setHasNewAbove(false);
    knownTopId.current = items[0]?.id ?? null;
    document.querySelector('.scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefresh = async () => {
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    knownTopId.current = items[0]?.id ?? null;
    setHasNewAbove(false);
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="pb-4">
        {/* ── Offline Banner ── */}
        {!isOnline && (
          <div className="mx-4 mt-2 mb-0 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>{tc('offlineBanner')}</span>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-[var(--top-safe-inset)] pb-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-black">{t('title')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('subtitle')}</p>
          </div>
          <NotificationBell />
        </div>

        {/* ── New activities pill ── */}
        {hasNewAbove && !isLoading && (
          <div className="sticky top-0 z-40 flex justify-center -mt-2 mb-2">
            <button
              onClick={scrollToTop}
              className="flex items-center gap-1.5 bg-brand-green text-white text-xs font-bold rounded-full px-4 py-2 shadow-[0_4px_16px_rgba(37,65,50,0.35)] active:scale-95 transition-transform animate-scale-in"
            >
              <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.5} />
              {t('newActivities')}
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {isLoading && (
          <div className="px-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3 bg-white rounded-2xl shadow-card mx-4 mb-3 p-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {isError && (
          <div className="mx-4 rounded-2xl bg-white shadow-card p-6 text-center">
            <AlertCircle className="w-10 h-10 text-brand-red mx-auto mb-3" />
            <h2 className="text-sm font-bold text-brand-black">{t('error')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('errorDescription')}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-6 py-2 bg-brand-green text-white text-sm font-medium rounded-full active:scale-95 transition-colors"
            >
              {t('retry')}
            </button>
          </div>
        )}

        {/* ── Empty ── */}
        {!isLoading && !isError && items.length === 0 && (
          <div className="mx-4 rounded-2xl bg-white shadow-card p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center mx-auto mb-3">
              <Rss className="w-7 h-7 text-brand-green" strokeWidth={1.5} />
            </div>
            <h2 className="text-sm font-bold text-brand-black">{t('empty')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('emptyDescription')}</p>
          </div>
        )}

        {/* ── Activity stream (new items tinted until next visit) ── */}
        {!isLoading && !isError && items.length > 0 && (
          <div className="pt-2 animate-fade-in-up">
            {items.map((item, idx) => {
              const itemIsNew = isNew(item.createdAt);
              // "NEW" divider sits directly above the FIRST new item (feed is
              // recency-sorted → new items cluster at the top).
              const showDivider =
                itemIsNew && (idx === 0 || !isNew(items[idx - 1].createdAt));
              return (
                <div key={item.id}>
                  {showDivider && (
                    <div className="flex items-center gap-2 px-6 pb-1 pt-1">
                      <span className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
                        {t('newDivider')}
                      </span>
                      <span className="h-px flex-1 bg-brand-green/20" />
                    </div>
                  )}
                  <div className={itemIsNew ? 'bg-brand-green/[0.04]' : ''}>
                    <ActivityCard item={item} locale={locale === 'ar' ? 'ar' : 'en'} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Refreshed-at hint ── */}
        {!isLoading && !isError && dataUpdatedAt > 0 && (
          <p className="text-center text-[10px] text-gray-300 mt-2">
            {t('updatedJustNow')}
          </p>
        )}
      </div>
    </PullToRefresh>
  );
}
