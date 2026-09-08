'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api } from '@/lib/api';
import type { Settlement, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import SortSelect from '@/components/SortSelect';
import { trackEvent } from '@/providers/ObservabilityProvider';

type SettlementsResponse = ListResponse<Settlement> & { settlements: Settlement[] };

export default function SettlementsPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const tl = useTranslations('list');
  const tc = useTranslations('common');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Settlement | null>(null);

  const sortParts = sort ? sort.split(':') : null;
  const sortField = sortParts?.[0] ?? '';
  const sortDir = sortParts?.[1] ?? '';

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);
  if (sortField) qs.set('sortBy', sortField);
  if (sortDir) qs.set('dir', sortDir);

  const { data, loading, error, reload, live, stale } = useLiveAdminData<SettlementsResponse>(`/admin/settlements?${qs.toString()}`);

  async function pay(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/settlements/${id}/pay`);
      reload();
      setSelected(null);
    } finally {
      setBusyId(null);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      await api.post('/admin/settlements/generate');
      reload();
    } finally {
      setGenerating(false);
    }
  }

  const columns: ColumnDef<Settlement>[] = [
    {
      key: 'venue',
      header: t('thVenue'),
      role: 'identity',
      render: (s) => <span className="font-medium text-gray-900">{s.venue_name ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: t('thAmount'),
      role: 'value',
      align: 'end',
      tabular: true,
      render: (s) => formatMoney(s.amount),
    },
    {
      key: 'status',
      header: t('thStatus'),
      role: 'meta',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'period',
      header: t('thPeriod'),
      role: 'meta',
      cardLabel: t('thPeriod'),
      render: (s) => (
        <span dir="ltr">
          {formatDate(s.period_start)} → {formatDate(s.period_end)}
        </span>
      ),
    },
    {
      key: 'payoutRef',
      header: t('thPayoutRef'),
      role: 'detail',
      render: (s) => <span dir="ltr">{s.payout_ref ?? '—'}</span>,
    },
    {
      key: 'id',
      header: t('thId'),
      role: 'detail',
      render: (s) => <span dir="ltr">{`#${s.id.slice(0, 8).toUpperCase()}`}</span>,
    },
  ];

  const sortOptions = [
    { value: '', label: tl('sortNewest') },
    { value: 'created_at:asc', label: tl('sortOldest') },
    { value: 'amount:desc', label: tl('sortAmountHigh') },
    { value: 'amount:asc', label: tl('sortAmountLow') },
  ];

  function onSortChange(v: string) {
    setSort(v);
    setPage(1);
    if (v) {
      const [field, dir] = v.split(':');
      trackEvent('admin_list_sort', { page: 'admin.settlements', sortBy: field, dir });
    }
  }

  return (
    <div>
      <PageHeader title={t('settlementsTitle')} subtitle={t('settlementsSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      <div className="flex flex-wrap items-center gap-3 px-8 py-4">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">{t('allStatuses')}</option>
          <option value="pending">{ts('pending')}</option>
          <option value="paid">{ts('paid')}</option>
          <option value="failed">{ts('failed')}</option>
        </select>
        <SortSelect value={sort} options={sortOptions} onChange={onSortChange} />
        <button
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {t('generatePayouts')}
        </button>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingSettlements')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={data?.settlements ?? []}
              rowKey={(s) => s.id}
              onRowClick={(s) => setSelected(s)}
              empty={<EmptyState message={tc('noData')} />}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.settlements"
        title={selected?.venue_name ?? t('thVenue')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thVenue'), value: selected.venue_name ?? '—' },
                { label: t('thAmount'), value: formatMoney(selected.amount) },
                { label: t('thStatus'), value: <StatusBadge status={selected.status} /> },
                {
                  label: t('thPeriod'),
                  value: (
                    <span dir="ltr">
                      {formatDate(selected.period_start)} → {formatDate(selected.period_end)}
                    </span>
                  ),
                },
                { label: t('thPayoutRef'), value: <span dir="ltr">{selected.payout_ref ?? '—'}</span> },
              ]
            : []
        }
        actions={
          selected && selected.status === 'pending' ? (
            busyId === selected.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <button
                onClick={() => pay(selected.id)}
                className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
              >
                <Send className="h-3.5 w-3.5" /> {t('payAction')}
              </button>
            )
          ) : undefined
        }
      />
    </div>
  );
}
