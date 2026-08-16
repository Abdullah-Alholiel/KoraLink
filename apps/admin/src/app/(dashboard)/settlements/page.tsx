'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useAdminData } from '@/lib/use-data';
import { api } from '@/lib/api';
import type { Settlement, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';

type SettlementsResponse = ListResponse<Settlement> & { settlements: Settlement[] };

export default function SettlementsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);

  const { data, loading, error, reload } = useAdminData<SettlementsResponse>(`/admin/settlements?${qs.toString()}`);

  async function pay(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/settlements/${id}/pay`);
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Settlements" subtitle="Venue payouts and earnings" />

      <div className="flex items-center gap-3 px-8 py-4">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">Loading settlements…</div>
      ) : error ? (
        <div className="px-8 py-10 text-sm text-red-600">Failed to load: {error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-8 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Venue</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Payout ref</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.settlements ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-8 py-3 font-mono text-xs text-gray-600">#{s.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-4 py-3 text-gray-900">{s.venue_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(s.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(s.period_start)} → {formatDate(s.period_end)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.payout_ref ?? '—'}</td>
                    <td className="px-4 py-3">
                      {busyId === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      ) : s.status === 'pending' ? (
                        <button
                          onClick={() => pay(s.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                        >
                          <Send className="h-3.5 w-3.5" /> Pay out
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
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
