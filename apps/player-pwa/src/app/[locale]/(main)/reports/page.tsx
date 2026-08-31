'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp, Flag, Loader2, ShieldCheck, WifiOff } from 'lucide-react';
import { useMyReports, type MyReportApi } from '@/hooks/useReports';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/** P2-23 (run #17): "My Reports" — reporters see their reports and outcomes. */

const STATUS_STYLE: Record<MyReportApi['status'], string> = {
  open: 'text-blue-700 bg-blue-100',
  reviewing: 'text-amber-700 bg-amber-100',
  resolved: 'text-green-700 bg-green-100',
  dismissed: 'text-gray-600 bg-gray-100',
};

export default function ReportsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/')[1] || 'en';
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const isOnline = useOnlineStatus();

  const { reports, isLoading, error, refetch, hasMore, fetchNextPage, isFetchingNextPage } =
    useMyReports();
  const [expanded, setExpanded] = useState<string | null>(null);

  const dateFmt = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Riyadh',
    }).format(new Date(iso));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center px-4 pt-[var(--top-safe-inset)] pb-3 bg-white relative z-10">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
        >
          <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
        </button>
        <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
          {t('title')}
        </h1>
      </div>

      {/* P2-31(4) (run #22): offline banner — same idiom as the feed */}
      {!isOnline && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span>{tc('offlineBanner')}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scroll-container bg-brand-bg p-4 space-y-3">
        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-green animate-spin" strokeWidth={2} />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex flex-col items-center py-20 text-center">
            <AlertTriangle className="w-10 h-10 text-gray-400 mb-3" strokeWidth={1.5} />
            <p className="text-sm text-gray-500">{t('error')}</p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-sm font-semibold text-brand-green"
            >
              {t('retry')}
            </button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && reports.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center">
            <ShieldCheck className="w-10 h-10 text-brand-green mb-3" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-brand-black">{t('emptyTitle')}</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[260px]">{t('emptyBody')}</p>
          </div>
        )}

        {/* Loaded */}
        {!isLoading && !error && reports.map((r) => {
          const isOpen = expanded === r.id;
          return (
            <div key={r.id} className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Flag className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-black truncate">
                      {r.subject_label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t(`subjectType.${r.subject_type}`)} · {dateFmt(r.created_at)}
                    </p>
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[r.status]}`}>
                  {t(`status.${r.status}`)}
                </span>
              </div>

              <p className="text-xs text-gray-600 mt-2 line-clamp-2">{r.reason}</p>

              {r.status !== 'open' && r.status !== 'reviewing' && (
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-green"
                >
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {t('outcomeToggle')}
                </button>
              )}
              {isOpen && (
                <div className="mt-2 rounded-xl bg-gray-50 p-3">
                  {r.resolution && (
                    <p className="text-xs text-gray-700">{r.resolution}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t('resolvedAt', { date: r.resolved_at ? dateFmt(r.resolved_at) : '—' })}
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {/* P2-31(2) (run #23): Load More — server-side pagination; hidden on the last page. */}
        {!isLoading && !error && hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={fetchNextPage}
              disabled={isFetchingNextPage}
              className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
            >
              {isFetchingNextPage ? tc('loading') : t('loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
