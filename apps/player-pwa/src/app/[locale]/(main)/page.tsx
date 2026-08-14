'use client';

import { useTranslations, useLocale } from 'next-intl';
import { AlertCircle, WifiOff, Rss } from 'lucide-react';
import { useFeed } from '@/hooks/useFeed';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import ActivityCard from '@/components/feed/ActivityCard';

export default function CommunityFeedPage() {
  const t = useTranslations('feed');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { data, isLoading, isError, refetch } = useFeed();
  const isOnline = useOnlineStatus();

  const items = data?.items ?? [];

  return (
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
      </div>

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

      {/* ── Activity stream ── */}
      {!isLoading && !isError && items.length > 0 && (
        <div className="pt-2 animate-fade-in-up">
          {items.map((item) => (
            <ActivityCard key={item.id} item={item} locale={locale === 'ar' ? 'ar' : 'en'} />
          ))}
        </div>
      )}
    </div>
  );
}
