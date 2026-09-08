'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import type { DisputeListItem, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';

type DisputesResponse = ListResponse<DisputeListItem> & { disputes: DisputeListItem[] };

export default function DisputesPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const tl = useTranslations('list');
  const tc = useTranslations('common');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DisputeListItem | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);

  const { data, loading, error, reload } = useLiveAdminData<DisputesResponse>(`/admin/disputes?${qs.toString()}`);

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
      render: (d) =>
        t.has(`disputeType.${d.type}`) ? t(`disputeType.${d.type}`) : d.type.replace(/_/g, ' '),
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
      <PageHeader title={t('disputesTitle')} subtitle={t('disputesSubtitle')} />

      <div className="flex items-center gap-3 px-8 py-4">
        <select
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
              rows={data?.disputes ?? []}
              rowKey={(d) => d.id}
              onRowClick={(d) => setSelected(d)}
              empty={<p className="px-8 py-10 text-sm text-gray-400">{tc('noData')}</p>}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.disputes"
        title={selected ? (t.has(`disputeType.${selected.type}`) ? t(`disputeType.${selected.type}`) : selected.type.replace(/_/g, ' ')) : t('disputesTitle')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thMatch'), value: selected.match_title ?? '—' },
                { label: t('thReporter'), value: selected.reporter_name ?? '—' },
                { label: t('thRespondent'), value: selected.respondent_name ?? '—' },
                { label: t('thStatus'), value: <StatusBadge status={selected.status} /> },
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
