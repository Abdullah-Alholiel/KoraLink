'use client';

import { useTranslations } from 'next-intl';

// Route skeleton (run #192, Reviewer B 5-state gap): reports had no
// loading.tsx — first paint flashed empty before the page's own spinner.
// Mirrors the page's card stack: header + two evidence cards.
export default function ReportsLoading() {
  const t = useTranslations('common');
  return (
    <div role="status" aria-label={t('loading')} className="animate-pulse pt-4">
      <div className="mx-4 mb-3 h-10 w-1/3 rounded-full bg-gray-200" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="mx-4 mb-3 rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
          </div>
          <div className="mt-4 h-9 w-full rounded-full bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
