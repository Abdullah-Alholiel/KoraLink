'use client';

import { useTranslations } from 'next-intl';

// Route skeleton (P2-138): conversation rows.
export default function MessagesLoading() {
  const t = useTranslations('common');
  return (
    <div role="status" aria-label={t('loading')} className="animate-pulse pt-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card">
          <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 rounded bg-gray-200" />
            <div className="h-3 w-3/4 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
