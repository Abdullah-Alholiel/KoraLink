'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
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
import { trackEvent } from '@/providers/ObservabilityProvider';
import { csvDate } from '@/lib/csv-export';
import { useExportFeedback } from '@/lib/use-export-feedback';

type AuditResponse = ListResponse<AuditLog> & { logs: AuditLog[] };

/** Discrete entity types written by admin services (matches audit_logs.entity_type). */
const ENTITY_TYPES = [
  'dispute',
  'match',
  'pitch',
  'report',
  'settlement',
  'setting',
  'slot',
  'transaction',
  'user',
  'venue',
] as const;

export default function AuditPage() {
  const t = useTranslations('hq');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  // Debounce the free-text action search so typing doesn't fire a request
  // per keystroke; committed value is what the query string uses.
  const [actionQuery, setActionQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setActionQuery(action), 300);
    return () => clearTimeout(id);
  }, [action]);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '50' });
  if (entityType) qs.set('entityType', entityType);
  if (actionQuery) qs.set('action', actionQuery);

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

  const rows = data?.logs ?? [];
  const exportDisabled = loading || !!error || rows.length === 0;
  const exportFeedback = useExportFeedback();


  function onExport() {
    exportFeedback.runExport({
      columns: [
        { key: 'admin', header: t('roleAdmin'), value: (l: AuditLog) => l.admin_name ?? '' },
        { key: 'action', header: t('thAction') },
        { key: 'entity', header: t('thEntity'), value: (l: AuditLog) => l.entity_type },
        { key: 'time', header: t('thTime'), value: (l: AuditLog) => csvDate(l.created_at) },
        { key: 'entityId', header: t('thEntityId'), value: (l: AuditLog) => l.entity_id ?? '' },
        { key: 'ip', header: t('thIp'), value: (l: AuditLog) => l.ip ?? '' },
      ],
      rows,
      filePrefix: 'koralink-audit',
      timestamp: new Date(),
    });
    trackEvent('admin_csv_export', { page: 'admin.audit', rows: rows.length });
  }

  return (
    <div>
      <PageHeader title={t('auditTitle')} subtitle={t('auditSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      <div className="flex items-center gap-3 px-8 py-4">
        <select
          aria-label={tc('filterByType')}
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{tc('allTypes')}</option>
          {ENTITY_TYPES.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label={tc('filterByAction')}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          placeholder={tc('filterByAction')}
          className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-label={tc('exportCsv')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {t('exportAudit')}
        </button>
      </div>

      {/* both live regions ALWAYS mounted — content swaps inside are
           announced reliably (conditional live regions are not); */}
      <p role="status" aria-live="polite" className="mx-8 mt-3 text-sm">
        {exportFeedback.kind === 'success' && (
          <span className="inline-block rounded-lg bg-green-50 px-3 py-2 text-green-700">
            {tc('exportedRows', { count: exportFeedback.rows })}
            <span className="sr-only"> #{exportFeedback.seq}</span>
          </span>
        )}
      </p>
      <p role="alert" className="mx-8 mt-3 text-sm">
        {exportFeedback.kind === 'error' && (
          <span className="inline-block rounded-lg bg-red-50 px-3 py-2 text-red-700">
            {tc('exportFailed')}
          </span>
        )}
      </p>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingAudit')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={rows}
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
