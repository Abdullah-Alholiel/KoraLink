'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Ban, Loader2, Pencil } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api } from '@/lib/api';
import type { AdminMatch, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import SortSelect from '@/components/SortSelect';
import MatchEditDrawer from '@/components/MatchEditDrawer';
import { trackEvent } from '@/providers/ObservabilityProvider';

type MatchesResponse = ListResponse<AdminMatch> & { matches: AdminMatch[] };

const TERMINAL = new Set(['Completed', 'Cancelled']);

export default function MatchesPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const tl = useTranslations('list');
  const tc = useTranslations('common');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMatch | null>(null);
  const [selected, setSelected] = useState<AdminMatch | null>(null);

  const sortParts = sort ? sort.split(':') : null;
  const sortField = sortParts?.[0] ?? '';
  const sortDir = sortParts?.[1] ?? '';

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);
  if (sortField) qs.set('sortBy', sortField);
  if (sortDir) qs.set('dir', sortDir);

  const { data, loading, error, reload } = useLiveAdminData<MatchesResponse>(`/admin/matches?${qs.toString()}`);

  async function cancel(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/matches/${id}/cancel`);
      reload();
      setSelected(null);
    } finally {
      setBusyId(null);
    }
  }

  const columns: ColumnDef<AdminMatch>[] = [
    {
      key: 'match',
      header: t('thMatch'),
      role: 'identity',
      render: (m) => <span className="font-medium text-gray-900">{m.title}</span>,
      secondary: (m) => `${m.venue_name} · ${m.pitch_name}`,
    },
    {
      key: 'price',
      header: t('thPrice'),
      role: 'value',
      align: 'end',
      tabular: true,
      render: (m) => formatMoney(m.price_per_player),
    },
    {
      key: 'status',
      header: t('thStatus'),
      role: 'meta',
      render: (m) => <StatusBadge status={m.status} />,
    },
    {
      key: 'scheduled',
      header: t('thScheduled'),
      role: 'meta',
      cardLabel: t('thScheduled'),
      render: (m) => <span dir="ltr">{formatDate(m.scheduled_at)}</span>,
    },
    {
      key: 'host',
      header: t('thHost'),
      role: 'detail',
      render: (m) => m.host_name ?? '—',
    },
    {
      key: 'spots',
      header: t('thSpots'),
      role: 'detail',
      tabular: true,
      render: (m) => (
        <span dir="ltr">
          {m.spots_filled}/{m.max_players}
        </span>
      ),
    },
  ];

  const sortOptions = [
    { value: '', label: tl('sortNewest') },
    { value: 'scheduled_at:asc', label: tl('sortOldest') },
    { value: 'price_per_player:desc', label: tl('sortAmountHigh') },
    { value: 'price_per_player:asc', label: tl('sortAmountLow') },
  ];

  function onSortChange(v: string) {
    setSort(v);
    setPage(1);
    if (v) {
      const [field, dir] = v.split(':');
      trackEvent('admin_list_sort', { page: 'admin.matches', sortBy: field, dir });
    }
  }

  return (
    <div>
      <PageHeader title={t('matchesTitle')} subtitle={t('matchesSubtitle')} />

      <div className="flex flex-wrap items-center gap-3 px-8 py-4">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="Open">{ts('open')}</option>
          <option value="Full">{ts('full')}</option>
          <option value="InProgress">{ts('inprogress')}</option>
          <option value="Completed">{ts('completed')}</option>
          <option value="Cancelled">{ts('cancelled')}</option>
        </select>
        <SortSelect value={sort} options={sortOptions} onChange={onSortChange} />
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingMatches')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={data?.matches ?? []}
              rowKey={(m) => m.id}
              onRowClick={(m) => setSelected(m)}
              empty={<p className="px-8 py-10 text-sm text-gray-400">{tc('noData')}</p>}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.matches"
        title={selected?.title ?? t('thMatch')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thVenue'), value: selected.venue_name },
                { label: t('thPitch'), value: selected.pitch_name },
                { label: t('thHost'), value: selected.host_name ?? '—' },
                { label: t('thStatus'), value: <StatusBadge status={selected.status} /> },
                { label: t('thScheduled'), value: <span dir="ltr">{formatDate(selected.scheduled_at)}</span> },
                {
                  label: t('thSpots'),
                  value: (
                    <span dir="ltr">
                      {selected.spots_filled}/{selected.max_players}
                    </span>
                  ),
                },
                { label: t('thPrice'), value: formatMoney(selected.price_per_player) },
              ]
            : []
        }
        actions={
          selected && !TERMINAL.has(selected.status) ? (
            busyId === selected.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setEditing(selected)}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-700"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t('editAction')}
                </button>
                <button
                  onClick={() => cancel(selected.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  <Ban className="h-3.5 w-3.5" /> {t('cancelAction')}
                </button>
              </div>
            )
          ) : undefined
        }
      />

      <MatchEditDrawer match={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}
