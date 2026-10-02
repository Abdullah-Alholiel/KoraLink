'use client';

import { useTranslations } from 'next-intl';

// Route skeleton (P2-138): search pill + date strip + MatchCard-shaped cards.
export default function PlayLoading() {
  const t = useTranslations('common');
  return (
    <div role="status" aria-label={t('loading')} className="animate-pulse pt-4">
      <div className="mx-4 mb-3 h-12 rounded-full bg-gray-200" />
      <div className="mx-4 mb-3 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 flex-1 rounded-2xl bg-gray-200" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mx-4 mb-3 rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="h-5 w-16 rounded bg-gray-200" />
            <div className="h-9 w-24 rounded-full bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
