'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import type { AuditLog, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';

type AuditResponse = ListResponse<AuditLog> & { logs: AuditLog[] };

export default function AuditPage() {
  const t = useTranslations('hq');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '50' });

  const { data, loading, error, reload, live, stale } = useLiveAdminData<AuditResponse>(`/admin/audit-logs?${qs.toString()}`);

  const columns: ColumnDef<AuditLog>[] = [
    {
      key: 'admin',
      header: t('roleAdmin'),
      role: 'identity',
      render: (l) => <span className="font-medium text-gray-900">{l.admin_name ?? '—'}</span>,
    },
    {
      key: 'action',
      header: t('thAction'),
      role: 'value',
      render: (l) => (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
          {l.action}
        </span>
      ),
    },
    {
      key: 'entity',
      header: t('thEntity'),
      role: 'meta',
      render: (l) => l.entity_type,
    },
    {
      key: 'time',
      header: t('thTime'),
      role: 'meta',
      cardLabel: t('thTime'),
      render: (l) => <span dir="ltr">{formatDate(l.created_at)}</span>,
    },
    {
      key: 'entityId',
      header: t('thEntityId'),
      role: 'detail',
      render: (l) => <span dir="ltr">{l.entity_id ?? '—'}</span>,
    },
    {
      key: 'ip',
      header: t('thIp'),
      role: 'detail',
      render: (l) => <span dir="ltr">{l.ip ?? '—'}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('auditTitle')} subtitle={t('auditSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingAudit')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={data?.logs ?? []}
              rowKey={(l) => l.id}
              onRowClick={(l) => setSelected(l)}
              empty={<EmptyState message={tc('noData')} />}
            />
          </div>
          <Pagination page={page} perPage={50} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.audit"
        title={selected?.admin_name ?? t('roleAdmin')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('roleAdmin'), value: selected.admin_name ?? '—' },
                { label: t('thAction'), value: selected.action },
                { label: t('thEntity'), value: selected.entity_type },
                { label: t('thEntityId'), value: <span dir="ltr">{selected.entity_id ?? '—'}</span> },
                { label: t('thIp'), value: <span dir="ltr">{selected.ip ?? '—'}</span> },
                { label: t('thTime'), value: <span dir="ltr">{formatDate(selected.created_at)}</span> },
              ]
            : []
        }
      />
    </div>
  );
}
