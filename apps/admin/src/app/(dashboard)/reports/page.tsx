'use client';

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
      <PageHeader title="Reports" subtitle="Triage user, match, and venue reports" />

      <div className="flex items-center gap-3 px-8 py-4">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <select
          value={subjectType}
          onChange={(e) => {
            setSubjectType(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All subjects</option>
          <option value="user">User</option>
          <option value="match">Match</option>
          <option value="venue">Venue</option>
          <option value="message">Message</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">Loading reports…</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">Failed to load reports: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">Report</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Reporter</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Reported</th>
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
