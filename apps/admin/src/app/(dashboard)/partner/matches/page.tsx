'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { AdminVenue, PartnerMatchList, PartnerMatchRow } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import SortSelect from '@/components/SortSelect';
import { trackEvent } from '@/providers/ObservabilityProvider';

const STATUS_OPTIONS = ['Open', 'Full', 'InProgress', 'Completed', 'Cancelled'];
const PAGE_SIZE = 20;

interface PitchOption {
  id: string;
  name: string;
  venue_id: string | null;
  venue_name: string | null;
}

export default function PartnerMatchesPage() {
  const t = useTranslations('partner.matches');
  const tl = useTranslations('list');
  const router = useRouter();
  const [scope, setScope] = useState<'today' | 'upcoming'>('today');
  const [status, setStatus] = useState<string>('');
  const [sort, setSort] = useState('');
  // P2-30: venue/pitch narrowing + server-side pager.
  const [venueId, setVenueId] = useState<string>('');
  const [pitchId, setPitchId] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: venues } = useLiveAdminData<AdminVenue[]>('/partner/venues', ['venues']);
  const { data: pitches } = useLiveAdminData<PitchOption[]>('/partner/pitches', ['pitches']);

  const venuePitches = useMemo(
    () => (pitches ?? []).filter((p) => !venueId || p.venue_id === venueId),
    [pitches, venueId],
  );

  const path = useMemo(() => {
    const qs = new URLSearchParams({ scope });
    if (status) qs.set('status', status);
    if (venueId) qs.set('venueId', venueId);
    if (pitchId) qs.set('pitchId', pitchId);
    if (sort) {
      const [field, dir] = sort.split(':');
      qs.set('sortBy', field);
      qs.set('dir', dir);
    }
    qs.set('limit', String(PAGE_SIZE));
    qs.set('offset', String((page - 1) * PAGE_SIZE));
    return `/partner/matches?${qs.toString()}`;
  }, [scope, status, venueId, pitchId, sort, page]);

  // Any filter change resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [scope, status, venueId, pitchId, sort]);

  const { data, loading, error } = useLiveAdminData<PartnerMatchList>(path, ['matches']);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          {/* P2-30: venue / pitch narrowing. */}
          <select
            aria-label={t('filterAllVenues')}
            value={venueId}
            onChange={(e) => {
              setVenueId(e.target.value);
              setPitchId('');
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="">{t('filterAllVenues')}</option>
            {(venues ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t('filterAllPitches')}
            value={pitchId}
            onChange={(e) => setPitchId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="">{t('filterAllPitches')}</option>
            {venuePitches.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <SortSelect
            value={sort}
            options={[
              { value: '', label: tl('sortNewest') },
              { value: 'scheduled_at:asc', label: tl('sortOldest') },
            ]}
            onChange={(v) => {
              setSort(v);
              setPage(1);
              if (v) {
                const [field, dir] = v.split(':');
                trackEvent('admin_list_sort', { page: 'partner.matches', sortBy: field, dir });
              }
            }}
          />
          {!loading && !error && (
            <span className="text-xs text-gray-500" dir="ltr">
              {t('showing', { count: data?.matches.length ?? 0, total })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <div className="text-sm text-red-600">{t('error', { error })}</div>
        ) : (
          <>
            <DataTable
              columns={
                [
                  {
                    key: 'match',
                    header: t('thMatch'),
                    role: 'identity',
                    render: (m: PartnerMatchRow) => (
                      <Link
                        href={`/partner/matches/${m.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {m.title}
                      </Link>
                    ),
                  },
                  {
                    key: 'players',
                    header: t('thPlayers'),
                    role: 'value',
                    align: 'end',
                    tabular: true,
                    cardLabel: t('thPlayers'),
                    render: (m: PartnerMatchRow) => (
                      <span dir="ltr">
                        {m.spots_filled}/{m.max_players}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    header: t('thStatus'),
                    role: 'meta',
                    render: (m: PartnerMatchRow) => <StatusBadge status={m.status} />,
                  },
                  {
                    key: 'time',
                    header: t('thTime'),
                    role: 'meta',
                    cardLabel: t('thTime'),
                    render: (m: PartnerMatchRow) => (
                      <span dir="ltr">{formatDate(m.scheduled_at)}</span>
                    ),
                  },
                  {
                    key: 'noShows',
                    header: t('thNoShows'),
                    role: 'detail',
                    tabular: true,
                    render: (m: PartnerMatchRow) =>
                      m.no_show_count > 0 ? (
                        <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          {m.no_show_count}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      ),
                  },
                  {
                    key: 'pitch',
                    header: t('thPitch'),
                    role: 'detail',
                    render: (m: PartnerMatchRow) => m.pitch_name ?? '—',
                  },
                  {
                    key: 'venue',
                    header: t('thVenue'),
                    role: 'detail',
                    render: (m: PartnerMatchRow) => m.venue_name ?? '—',
                  },
                ] satisfies ColumnDef<PartnerMatchRow>[]
              }
              rows={data?.matches ?? []}
              rowKey={(m) => m.id}
              onRowClick={(m) => router.push(`/partner/matches/${m.id}`)}
              empty={<div className="py-4 text-sm text-gray-400">{t('empty')}</div>}
            />

            {/* P2-30: server-side pager (page size 20). */}
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 disabled:opacity-40"
                >
                  {t('prevPage')}
                </button>
                <span className="text-xs text-gray-500" dir="ltr">
                  {t('pageOf', { page, total: totalPages })}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 disabled:opacity-40"
                >
                  {t('nextPage')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
