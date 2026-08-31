'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import Link from 'next/link';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { AdminReportListItem, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';

type ReportsResponse = ListResponse<AdminReportListItem> & { reports: AdminReportListItem[] };

export default function ReportsPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const [status, setStatus] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);
  if (subjectType) qs.set('subjectType', subjectType);

  const { data, loading, error } = useLiveAdminData<ReportsResponse>(
    `/admin/reports?${qs.toString()}`,
    ['reports'],
  );

  return (
    <div>
      <PageHeader title={t('reportsTitle')} subtitle={t('reportsSubtitle')} />

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
          <option value="open">{ts('open')}</option>
          <option value="reviewing">{ts('reviewing')}</option>
          <option value="resolved">{ts('resolved')}</option>
          <option value="dismissed">{ts('dismissed')}</option>
        </select>
        <select
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
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingReports')}</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">{t('loadFailed')}: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">{t('thReport')}</th>
                  <th className="px-4 py-3 font-medium">{t('thSubject')}</th>
                  <th className="px-4 py-3 font-medium">{t('thReporter')}</th>
                  <th className="px-4 py-3 font-medium">{t('thReason')}</th>
                  <th className="px-4 py-3 font-medium">{t('thStatus')}</th>
                  <th className="px-4 py-3 font-medium">{t('thReported')}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.reports ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-8 py-3 font-mono text-xs text-gray-600">
                      #{r.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{r.subject_label ?? '—'}</div>
                      <div className="text-xs uppercase tracking-wide text-gray-400">{r.subject_type}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.reporter_name ?? r.reporter_handle ?? '—'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-600" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/reports/${r.id}`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  );
}
