'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api } from '@/lib/api';
import type { AdminTransaction, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import SortSelect from '@/components/SortSelect';
import { trackEvent } from '@/providers/ObservabilityProvider';

type TxResponse = ListResponse<AdminTransaction> & { transactions: AdminTransaction[] };

export default function TransactionsPage() {
  const hq = useTranslations('hq');
  const ts = useTranslations('status');
  const tl = useTranslations('list');
  const tc = useTranslations('common');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminTransaction | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);
  if (type) qs.set('type', type);
  if (sort) {
    const [field, dir] = sort.split(':');
    qs.set('sortBy', field);
    qs.set('dir', dir);
  }

  const { data, loading, error, reload, live, stale } = useLiveAdminData<TxResponse>(`/admin/transactions?${qs.toString()}`);

  async function refund(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/transactions/${id}/refund`);
      reload();
      setSelected(null);
    } finally {
      setBusyId(null);
    }
  }

  const columns: ColumnDef<AdminTransaction>[] = [
    {
      key: 'user',
      header: hq('thUser'),
      role: 'identity',
      render: (t) => t.user_name ?? '—',
      secondary: (t) => t.user_phone ?? '',
    },
    {
      key: 'type',
      header: hq('thType'),
      role: 'meta',
      render: (t) => (
        <span className={`text-xs font-semibold ${t.type === 'CREDIT' ? 'text-green-600' : 'text-gray-700'}`}>
          {t.type}
        </span>
      ),
    },
    {
      key: 'status',
      header: hq('thStatus'),
      role: 'meta',
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: 'date',
      header: hq('thDate'),
      role: 'meta',
      // Label the ambiguous: a bare "4 Mar" means nothing (reel move 4).
      cardLabel: hq('thDate'),
      render: (t) => <span dir="ltr">{formatDate(t.created_at)}</span>,
    },
    {
      key: 'amount',
      header: hq('thAmount'),
      role: 'value',
      align: 'end',
      tabular: true,
      render: (t) => (
        <span className={t.type === 'CREDIT' ? 'text-green-700' : 'text-gray-900'}>
          {formatMoney(t.amount)}
        </span>
      ),
    },
    {
      key: 'reference',
      header: hq('thReference'),
      role: 'detail',
      render: (t) => <span dir="ltr">{t.reference_type.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'id',
      header: hq('thId'),
      role: 'detail',
      // The ID leaves first — it survives in the drawer, not the row (reel move 1).
      render: (t) => <span dir="ltr">{`#${t.id.slice(0, 8).toUpperCase()}`}</span>,
    },
  ];

  const sortOptions = [
    { value: '', label: tl('sortNewest') },
    { value: 'created_at:asc', label: tl('sortOldest') },
    { value: 'amount:desc', label: tl('sortAmountHigh') },
    { value: 'amount:asc', label: tl('sortAmountLow') },
  ];

  return (
    <div>
      <PageHeader title={hq('transactionsTitle')} subtitle={hq('transactionsSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      <div className="flex flex-wrap items-center gap-3 px-8 py-4">
        <select aria-label={tc('filterByStatus')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">{hq('allStatuses')}</option>
          <option value="Pending">{ts('pending')}</option>
          <option value="Completed">{ts('completed')}</option>
          <option value="Failed">{ts('failed')}</option>
          <option value="Reversed">{ts('reversed')}</option>
        </select>
        <select aria-label={tc('filterByType')} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">{hq('allTypes')}</option>
          <option value="DEBIT">{hq('typeDebit')}</option>
          <option value="CREDIT">{hq('typeCredit')}</option>
        </select>
        <SortSelect
          value={sort}
          options={sortOptions}
          onChange={(v) => {
            setSort(v);
            setPage(1);
            if (v) {
              const [field, dir] = v.split(':');
              trackEvent('admin_list_sort', { page: 'admin.transactions', sortBy: field, dir });
            }
          }}
        />
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{hq('loadingTransactions')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={data?.transactions ?? []}
              rowKey={(t) => t.id}
              onRowClick={(t) => setSelected(t)}
              empty={<EmptyState message={tc('noData')} />}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.transactions"
        title={selected?.user_name ?? hq('thUser')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: hq('thUser'), value: selected.user_name ?? '—' },
                { label: hq('thPhone'), value: <span dir="ltr">{selected.user_phone ?? '—'}</span> },
                { label: hq('thType'), value: selected.type },
                { label: hq('thReference'), value: <span dir="ltr">{selected.reference_type.replace(/_/g, ' ')}</span> },
                { label: hq('thAmount'), value: formatMoney(selected.amount) },
                { label: hq('thStatus'), value: <StatusBadge status={selected.status} /> },
                { label: hq('thDate'), value: <span dir="ltr">{formatDate(selected.created_at)}</span> },
              ]
            : []
        }
        actions={
          selected && selected.type === 'DEBIT' && selected.status === 'Completed' ? (
            busyId === selected.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <button
                onClick={() => refund(selected.id)}
                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {hq('refundAction')}
              </button>
            )
          ) : undefined
        }
      />
    </div>
  );
}
