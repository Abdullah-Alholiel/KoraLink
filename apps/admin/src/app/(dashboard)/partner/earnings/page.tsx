'use client';

import { Wallet } from 'lucide-react';
import { useAdminData } from '@/lib/use-data';
import type { PartnerEarnings } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';

export default function PartnerEarningsPage() {
  const { data, loading, error } = useAdminData<PartnerEarnings>('/partner/earnings');

  return (
    <div>
      <PageHeader title="Earnings" subtitle="Settlements and payouts for your venues" />

      <div className="space-y-6 p-8">
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-600">Failed to load: {error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
              <MetricCard label="Total Pending" value={formatMoney(data?.totalPending ?? 0)} icon={Wallet} />
              <MetricCard label="Total Paid" value={formatMoney(data?.totalPaid ?? 0)} icon={Wallet} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">Settlements</h2>
              <table className="w-full text-left text-sm">
                <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Venue</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Payout ref</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.settlements ?? []).map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">#{s.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-gray-900">{s.venue_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(s.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(s.period_start)} → {formatDate(s.period_end)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{s.payout_ref ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.settlements?.length && (
                <div className="py-4 text-sm text-gray-400">No settlements yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
