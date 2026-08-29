'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { PartnerMatchList } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

const STATUS_OPTIONS = ['Open', 'Full', 'InProgress', 'Completed', 'Cancelled'];

export default function PartnerMatchesPage() {
  const t = useTranslations('partner.matches');
  const [scope, setScope] = useState<'today' | 'upcoming'>('today');
  const [status, setStatus] = useState<string>('');

  const path = useMemo(() => {
    const qs = new URLSearchParams({ scope });
    if (status) qs.set('status', status);
    return `/partner/matches?${qs.toString()}`;
  }, [scope, status]);

  const { data, loading, error } = useLiveAdminData<PartnerMatchList>(path, ['matches']);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label={t('scopeToday')}
            value={scope}
            onChange={(e) => setScope(e.target.value as 'today' | 'upcoming')}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="today">{t('scopeToday')}</option>
            <option value="upcoming">{t('scopeUpcoming')}</option>
          </select>
          <select
            aria-label={t('filterAll')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="">{t('filterAll')}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {!loading && !error && (
            <span className="text-xs text-gray-500" dir="ltr">
              {t('showing', { count: data?.matches.length ?? 0, total: data?.total ?? 0 })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <div className="text-sm text-red-600">{t('error', { error })}</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <table className="w-full text-start text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('thMatch')}</th>
                  <th className="px-4 py-3 font-medium">{t('thPitch')}</th>
                  <th className="px-4 py-3 font-medium">{t('thVenue')}</th>
                  <th className="px-4 py-3 font-medium">{t('thTime')}</th>
                  <th className="px-4 py-3 font-medium">{t('thPlayers')}</th>
                  <th className="px-4 py-3 font-medium">{t('thNoShows')}</th>
                  <th className="px-4 py-3 font-medium">{t('thStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.matches ?? []).map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/partner/matches/${m.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {m.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{m.pitch_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{m.venue_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600" dir="ltr">
                      {formatDate(m.scheduled_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {m.spots_filled}/{m.max_players}
                    </td>
                    <td className="px-4 py-3" dir="ltr">
                      {m.no_show_count > 0 ? (
                        <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          {m.no_show_count}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.matches.length && (
              <div className="py-4 text-sm text-gray-400">{t('empty')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
