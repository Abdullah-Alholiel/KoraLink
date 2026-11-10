'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import type { AuditLog, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import { trackEvent } from '@/providers/ObservabilityProvider';
import { csvDate } from '@/lib/csv-export';
import { useExportFeedback, ExportFeedbackNote } from '@/lib/use-export-feedback';

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
  'venue_review',
] as const;

export default function AuditPage() {
  const t = useTranslations('hq');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  // P2-335 (Reviewer B run #198): date-range filter for incident forensics —
  // "what happened last Tuesday" must not require paging. The committed range
  // rides the same query string as the table, so the full-set CSV export
  // inherits it automatically (P2-147 contract: export = same filters).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);

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
  const exportFeedback = useExportFeedback();
  const exportDisabled = loading || !!error || rows.length === 0 || exportFeedback.exporting;


  // P2-147: export the FULL filtered set (same filters/sort as the table),
  // not just the rendered page.
  async function onExport() {
    const exported = await exportFeedback.runFullExport<AuditResponse, AuditLog>({
      url: `/admin/audit-logs?${qs.toString()}`,
      rowKey: 'logs',
      build: (allRows) => ({
        columns: [
          { key: 'admin', header: t('roleAdmin'), value: (l: AuditLog) => l.admin_name ?? '' },
          { key: 'action', header: t('thAction') },
          { key: 'entity', header: t('thEntity'), value: (l: AuditLog) => l.entity_type },
          { key: 'time', header: t('thTime'), value: (l: AuditLog) => csvDate(l.created_at) },
          { key: 'entityId', header: t('thEntityId'), value: (l: AuditLog) => l.entity_id ?? '' },
          { key: 'ip', header: t('thIp'), value: (l: AuditLog) => l.ip ?? '' },
        ],
        rows: allRows,
        filePrefix: 'koralink-audit',
        timestamp: new Date(),
      }),
    });
    if (exported !== null) trackEvent('admin_csv_export', { page: 'admin.audit', rows: exported });
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
        {/* P2-335: date-range forensics filter (UTC day bounds; API treats
            `to` as on/before that day). Browser-native date inputs keep the
            console dependency-free; dir=ltr per the console date convention. */}
        <input
          type="date"
          aria-label={tc('filterFromDate')}
          value={from}
          max={to || undefined}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <span className="text-sm text-gray-400">–</span>
        <input
          type="date"
          aria-label={tc('filterToDate')}
          value={to}
          min={from || undefined}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
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

      {/* shared always-mounted live-region pair (success polite /
           error assertive) — markup lives beside the hook */}
      <ExportFeedbackNote feedback={exportFeedback} />

      {loading ? (
        <LoadingState message={t('loadingAudit')} />
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
