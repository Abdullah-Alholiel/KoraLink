'use client';

import { useTranslations } from 'next-intl';

interface LiveBadgeProps {
  /** Live socket connected (ops-data-changed updates flowing). */
  live: boolean;
  /** Connected before, then dropped — rendered data may be aging. */
  stale: boolean;
}

/**
 * Live/stale data badge (run #42, P2-55; Reviewer A + B — the hook tracked
 * socket `live` but no page rendered it, so admins couldn't tell when data
 * stopped flowing). Renders:
 *  - live  → green dot + "Live" (data refreshed via ops-data-changed pings)
 *  - stale → amber dot + "Stale" (socket dropped after connecting; poll
 *    fallback still refreshes every 30s, but treat numbers as aging)
 *  - neither → nothing (socket never connected — no false promise)
 *
 * Wired into PageHeader actions on list pages via the useLiveAdminData
 * destructure (`live, stale`).
 */
export default function LiveBadge({ live, stale }: LiveBadgeProps) {
  const t = useTranslations('common');
  if (!live) {
    if (!stale) return null;
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
        role="status"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        {t('dataStale')}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"
      role="status"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
      {t('dataLive')}
    </span>
  );
}
