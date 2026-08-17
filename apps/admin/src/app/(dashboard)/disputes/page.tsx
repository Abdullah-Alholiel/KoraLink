'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { DisputeListItem, ListResponse } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';

type DisputesResponse = ListResponse<DisputeListItem> & { disputes: DisputeListItem[] };

export default function DisputesPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);

  const { data, loading, error } = useLiveAdminData<DisputesResponse>(`/admin/disputes?${qs.toString()}`);

  return (
    <div>
      <PageHeader title="Disputes" subtitle="Resolve no-show appeals and other disputes" />

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
          <option value="opened">Opened</option>
          <option value="under_review">Under review</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">Loading disputes…</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">Failed to load disputes: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">Dispute</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Reporter</th>
                  <th className="px-4 py-3 font-medium">Respondent</th>
                  <th className="px-4 py-3 font-medium">Match</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.disputes ?? []).map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-8 py-3 font-mono text-xs text-gray-600">#{d.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-4 py-3 text-gray-700">{d.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-gray-700">{d.reporter_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{d.respondent_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{d.match_title ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(d.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/disputes/${d.id}`}
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
