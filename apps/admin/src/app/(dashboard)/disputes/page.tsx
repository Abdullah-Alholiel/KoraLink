'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import type { DisputeListItem, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import { trackEvent } from '@/providers/ObservabilityProvider';
import { csvDate, exportCsv } from '@/lib/csv-export';
import { Download } from 'lucide-react';

type DisputesResponse = ListResponse<DisputeListItem> & { disputes: DisputeListItem[] };

export default function DisputesPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const tl = useTranslations('list');
  const tc = useTranslations('common');
  const [status, setStatus] = useState('');
  const [appeal, setAppeal] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DisputeListItem | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);
  if (appeal) qs.set('appeal', appeal);

  const { data, loading, error, reload, live, stale } = useLiveAdminData<DisputesResponse>(`/admin/disputes?${qs.toString()}`);

  const rows = data?.disputes ?? [];
  const exportDisabled = loading || !!error || rows.length === 0;

  function disputeTypeLabel(d: DisputeListItem): string {
    return t.has(`disputeType.${d.type}`) ? t(`disputeType.${d.type}`) : d.type.replace(/_/g, ' ');
  }

  function onExport() {
    exportCsv({
      columns: [
        { key: 'match', header: t('thMatch'), value: (d: DisputeListItem) => d.match_title ?? '' },
        { key: 'status', header: t('thStatus'), value: (d: DisputeListItem) => d.status },
        { key: 'opened', header: ts('opened'), value: (d: DisputeListItem) => csvDate(d.created_at) },
        { key: 'type', header: t('thType'), value: disputeTypeLabel },
        { key: 'reporter', header: t('thReporter'), value: (d: DisputeListItem) => d.reporter_name ?? '' },
        { key: 'respondent', header: t('thRespondent'), value: (d: DisputeListItem) => d.respondent_name ?? '' },
        { key: 'id', header: t('thId') },
      ],
      rows,
      filePrefix: 'koralink-disputes',
      timestamp: new Date(),
    });
    trackEvent('admin_csv_export', { page: 'admin.disputes', rows: rows.length });
  }

  const columns: ColumnDef<DisputeListItem>[] = [
    {
      key: 'match',
      header: t('thMatch'),
      role: 'identity',
      render: (d) => <span className="font-medium text-gray-900">{d.match_title ?? '—'}</span>,
    },
    {
      key: 'status',
      header: t('thStatus'),
      role: 'value',
      render: (d) => <StatusBadge status={d.status} />,
    },
    {
      key: 'appeal',
      header: t('thAppeal'),
      role: 'value',
      cardLabel: t('thAppeal'),
      render: (d) =>
        d.has_appealed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {t('appealBadge', { count: d.appeal_count })}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      key: 'opened',
      header: ts('opened'),
      role: 'meta',
      cardLabel: ts('opened'),
      render: (d) => <span dir="ltr">{formatDate(d.created_at)}</span>,
    },
    {
      key: 'type',
      header: t('thType'),
      role: 'detail',
      render: (d) => disputeTypeLabel(d),
    },
    {
      key: 'reporter',
      header: t('thReporter'),
      role: 'detail',
      render: (d) => d.reporter_name ?? '—',
    },
    {
      key: 'respondent',
      header: t('thRespondent'),
      role: 'detail',
      render: (d) => d.respondent_name ?? '—',
    },
  ];

  return (
    <div>
      <PageHeader title={t('disputesTitle')} subtitle={t('disputesSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      <div className="flex items-center gap-3 px-8 py-4">
        <select
          aria-label={tc('filterByStatus')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('allStatuses')}</option>
          <option value="opened">{ts('opened')}</option>
          <option value="under_review">{ts('under_review')}</option>
          <option value="resolved">{ts('resolved')}</option>
          <option value="rejected">{ts('rejected')}</option>
        </select>
        <select
          aria-label={t('filterByAppeal')}
          value={appeal}
          onChange={(e) => {
            setAppeal(e.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('allDisputes')}</option>
          <option value="true">{t('withAppeal')}</option>
          <option value="false">{t('withoutAppeal')}</option>
        </select>
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-label={tc('exportCsv')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {t('exportDisputes')}
        </button>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingDisputes')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(d) => d.id}
              onRowClick={(d) => setSelected(d)}
              empty={<EmptyState message={tc('noData')} />}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.disputes"
        title={selected ? disputeTypeLabel(selected) : t('disputesTitle')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thMatch'), value: selected.match_title ?? '—' },
                { label: t('thReporter'), value: selected.reporter_name ?? '—' },
                { label: t('thRespondent'), value: selected.respondent_name ?? '—' },
                { label: t('thStatus'), value: <StatusBadge status={selected.status} /> },
                {
                  label: t('thAppeal'),
                  value: selected.has_appealed ? t('appealBadge', { count: selected.appeal_count }) : '—',
                },
                { label: ts('opened'), value: <span dir="ltr">{formatDate(selected.created_at)}</span> },
              ]
            : []
        }
        footerLink={
          selected
            ? { href: `/disputes/${selected.id}`, label: tl('openPage') }
            : undefined
        }
      />
    </div>
  );
}
