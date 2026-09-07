'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { PartnerMatchDetail } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import DataTable, { type ColumnDef } from '@/components/DataTable';

/** Row shape of PartnerMatchDetail.players (local: keeps the table generic). */
interface RosterPlayer {
  user_id: string;
  full_name: string | null;
  phone: string;
  is_host: boolean;
  no_show: boolean;
}

export default function PartnerMatchDetailPage() {
  const t = useTranslations('partner.matches');
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

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
              <DataTable
                columns={
                  [
                    {
                      key: 'player',
                      header: t('rosterPlayer'),
                      role: 'identity',
                      render: (p: RosterPlayer) => (
                        <span className="font-medium text-gray-900">{p.full_name ?? '—'}</span>
                      ),
                      secondary: (p: RosterPlayer) => (
                        <span dir="ltr">{p.phone}</span>
                      ),
                    },
                    {
                      key: 'state',
                      header: t('host'),
                      role: 'value',
                      render: (p: RosterPlayer) =>
                        p.is_host ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {t('host')}
                          </span>
                        ) : p.no_show ? (
                          <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            {t('noShow')}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        ),
                    },
                    {
                      key: 'noShow',
                      header: t('thNoShows'),
                      role: 'meta',
                      cardLabel: t('thNoShows'),
                      render: (p: RosterPlayer) =>
                        p.no_show ? (
                          <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            {t('noShow')}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        ),
                    },
                    {
                      key: 'phone',
                      header: t('rosterPhone'),
                      role: 'detail',
                      render: (p: RosterPlayer) => (
                        <span dir="ltr">{p.phone}</span>
                      ),
                    },
                  ] satisfies ColumnDef<RosterPlayer>[]
                }
                rows={data?.players ?? []}
                rowKey={(p) => p.user_id}
                empty={<div className="py-4 text-sm text-gray-400">{t('empty')}</div>}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
