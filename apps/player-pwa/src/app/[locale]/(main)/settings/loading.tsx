'use client';

import { useTranslations } from 'next-intl';

// Route skeleton (P2-138 convention): header bar + settings rows.
export default function SettingsLoading() {
  const t = useTranslations('common');
  return (
    <div role="status" aria-label={t('loading')} className="animate-pulse pt-6">
      <div className="mx-4 mb-6 h-12 rounded-2xl bg-gray-100" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="mx-4 mb-3 flex h-14 items-center gap-3 rounded-2xl bg-white px-4 shadow-card">
          <div className="h-6 w-6 shrink-0 rounded-full bg-gray-200" />
          <div className="h-4 w-1/2 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
