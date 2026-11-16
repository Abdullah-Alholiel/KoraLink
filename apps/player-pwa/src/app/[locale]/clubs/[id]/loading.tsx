'use client';

import { useTranslations } from 'next-intl';

// Route skeleton (P2-180): the club-detail page renders a hero image, a
// rounded info sheet and venue-pitch/review rows — the skeleton mirrors that
// shape so the first paint doesn't jump when data lands.
export default function ClubLoading() {
  const t = useTranslations('common');
  return (
    <div role="status" aria-label={t('loading')} className="min-h-dvh animate-pulse bg-brand-bg">
      {/* hero image block */}
      <div className="h-56 w-full bg-gray-200" />
      {/* rounded info sheet */}
      <div className="-mt-6 rounded-t-3xl bg-white p-5">
        <div className="mb-3 h-6 w-2/3 rounded bg-gray-200" />
        <div className="mb-5 flex items-center gap-2">
          <div className="h-4 w-1/3 rounded bg-gray-100" />
          <div className="h-4 w-16 rounded bg-gray-100" />
        </div>
        {/* pitch rows */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="mb-4 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 rounded bg-gray-200" />
              <div className="h-3 w-1/3 rounded bg-gray-100" />
            </div>
          </div>
        ))}
        <div className="mt-6 h-12 w-full rounded-2xl bg-gray-200" />
      </div>
    </div>
  );
}
