'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import type { AdminReportListItem, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import { trackEvent } from '@/providers/ObservabilityProvider';
import { csvDate } from '@/lib/csv-export';
import { useExportFeedback, ExportFeedbackNote } from '@/lib/use-export-feedback';
import { Download } from 'lucide-react';

type ReportsResponse = ListResponse<AdminReportListItem> & { reports: AdminReportListItem[] };

export default function ReportsPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const tl = useTranslations('list');
  const tc = useTranslations('common');
  const [status, setStatus] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminReportListItem | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);
  if (subjectType) qs.set('subjectType', subjectType);

  const { data, loading, error, reload, live, stale } = useLiveAdminData<ReportsResponse>(
    `/admin/reports?${qs.toString()}`,
    ['reports'],
  );

  const rows = data?.reports ?? [];
  const exportDisabled = loading || !!error || rows.length === 0;
  const exportFeedback = useExportFeedback();


  function onExport() {
    exportFeedback.runExport({
      columns: [
        { key: 'subject', header: t('thSubject'), value: (r: AdminReportListItem) => r.subject_label ?? '' },
        { key: 'subjectType', header: t('thSubjectType'), value: (r: AdminReportListItem) => r.subject_type },
        { key: 'status', header: t('thStatus'), value: (r: AdminReportListItem) => r.status },
        { key: 'reported', header: t('thReported'), value: (r: AdminReportListItem) => csvDate(r.created_at) },
        { key: 'reporter', header: t('thReporter'), value: (r: AdminReportListItem) => r.reporter_name ?? r.reporter_handle ?? '' },
        { key: 'reason', header: t('thReason'), value: (r: AdminReportListItem) => r.reason },
        { key: 'id', header: t('thId') },
      ],
      rows,
      filePrefix: 'koralink-reports',
      timestamp: new Date(),
    });
    trackEvent('admin_csv_export', { page: 'admin.reports', rows: rows.length });
  }

  const columns: ColumnDef<AdminReportListItem>[] = [
    {
      key: 'subject',
      header: t('thSubject'),
      role: 'identity',
      render: (r) => <span className="font-medium text-gray-900">{r.subject_label ?? '—'}</span>,
      secondary: (r) => r.subject_type,
    },
    {
      key: 'status',
      header: t('thStatus'),
      role: 'value',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'reported',
      header: t('thReported'),
      role: 'meta',
      cardLabel: t('thReported'),
      render: (r) => <span dir="ltr">{formatDate(r.created_at)}</span>,
    },
    {
      key: 'reporter',
      header: t('thReporter'),
      role: 'detail',
      render: (r) => r.reporter_name ?? r.reporter_handle ?? '—',
    },
    {
      key: 'reason',
      header: t('thReason'),
      role: 'detail',
      render: (r) => r.reason,
    },
  ];

  return (
    <div>
      <PageHeader title={t('reportsTitle')} subtitle={t('reportsSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

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
          <option value="open">{ts('open')}</option>
          <option value="reviewing">{ts('reviewing')}</option>
          <option value="resolved">{ts('resolved')}</option>
          <option value="dismissed">{ts('dismissed')}</option>
        </select>
        <select
          aria-label={tc('filterBySubject')}
          value={subjectType}
          onChange={(e) => {
            setSubjectType(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('allSubjects')}</option>
          <option value="user">{t('thUser')}</option>
          <option value="match">{t('thMatch')}</option>
          <option value="venue">{t('thVenue')}</option>
          <option value="message">{t('thMessage')}</option>
        </select>
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-label={tc('exportCsv')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {t('exportReports')}
        </button>
      </div>

      {/* shared always-mounted live-region pair (success polite /
           error assertive) — markup lives beside the hook */}
      <ExportFeedbackNote feedback={exportFeedback} />

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingReports')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelected(r)}
              empty={<EmptyState message={tc('noData')} />}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.reports"
        title={selected?.subject_label ?? t('reportsTitle')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thSubject'), value: selected.subject_label ?? '—' },
                { label: t('thSubjectType'), value: selected.subject_type },
                { label: t('thReporter'), value: selected.reporter_name ?? selected.reporter_handle ?? '—' },
                { label: t('thReason'), value: selected.reason },
                { label: t('thStatus'), value: <StatusBadge status={selected.status} /> },
                { label: t('thReported'), value: <span dir="ltr">{formatDate(selected.created_at)}</span> },
              ]
            : []
        }
        footerLink={
          selected
            ? { href: `/reports/${selected.id}`, label: tl('openPage') }
            : undefined
        }
      />
    </div>
  );
}
