'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { PartnerMatchDetail } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

export default function PartnerMatchDetailPage() {
  const t = useTranslations('partner.matches');
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, loading, error } = useLiveAdminData<PartnerMatchDetail>(
    `/partner/matches/${id}`,
    ['matches'],
  );

  return (
    <div>
      <PageHeader title={data?.title ?? t('loading')} subtitle={t('rosterTitle')} />

      <div className="space-y-6 p-8">
        <Link
          href="/partner/matches"
          className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
        >
          {t('back')}
        </Link>

        {loading ? (
          <div className="text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <div className="text-sm text-red-600">{t('error', { error })}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('thTime')}
                </div>
                <div className="mt-1 text-sm text-gray-900" dir="ltr">
                  {formatDate(data?.scheduled_at)}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('thStatus')}
                </div>
                <div className="mt-1">
                  <StatusBadge status={data?.status ?? ''} />
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('thPlayers')}
                </div>
                <div className="mt-1 text-sm text-gray-900" dir="ltr">
                  {data?.spots_filled ?? 0}/{data?.max_players ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('thNoShows')}
                </div>
                <div className="mt-1 text-sm text-gray-900" dir="ltr">
                  {data?.no_show_count ?? 0}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">{t('rosterTitle')}</h2>
                <span className="text-xs text-gray-500" dir="ltr">
                  {data?.visibility === 'private' ? t('visibilityPrivate') : t('visibilityPublic')}
                </span>
              </div>
              <table className="w-full text-start text-sm">
                <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('rosterPlayer')}</th>
                    <th className="px-4 py-3 font-medium">{t('rosterPhone')}</th>
                    <th className="px-4 py-3 font-medium">{t('host')}</th>
                    <th className="px-4 py-3 font-medium">{t('thNoShows')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.players ?? []).map((p) => (
                    <tr key={p.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{p.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600" dir="ltr">
                        {p.phone}
                      </td>
                      <td className="px-4 py-3">
                        {p.is_host ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {t('host')}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.no_show ? (
                          <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            {t('noShow')}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.players.length && (
                <div className="py-4 text-sm text-gray-400">{t('empty')}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
