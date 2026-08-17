'use client';

import { CalendarClock, TrendingUp, Wallet } from 'lucide-react';
import { useAdminData } from '@/lib/use-data';
import type { PartnerDashboard } from '@/lib/types';
import { formatMoney, formatPercent } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';

export default function PartnerDashboardPage() {
  const { data, loading, error } = useAdminData<PartnerDashboard>('/partner/dashboard');

  if (loading) {
    return (
      <div>
        <PageHeader title="Venue Dashboard" subtitle="Loading…" />
        <div className="p-8 text-sm text-gray-500">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title="Venue Dashboard" />
        <div className="p-8 text-sm text-red-600">Failed to load: {error}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Venue Dashboard"
        subtitle={`Welcome, ${data.venueNames.join(', ') || 'Venue'}`}
      />

      <div className="space-y-6 p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Today's Utilization" value={formatPercent(data.todayUtilization)} icon={TrendingUp} />
          <MetricCard label="Upcoming Matches" value={String(data.upcomingMatches)} icon={CalendarClock} />
          <MetricCard label="Revenue Today" value={formatMoney(data.revenueToday)} icon={Wallet} />
          <MetricCard
            label="Next Match"
            value={data.nextMatchInMinutes != null ? `In ${data.nextMatchInMinutes}m` : '—'}
            icon={CalendarClock}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Pitch Schedule (Today)</h2>
          <table className="w-full text-left text-sm">
            <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Pitch</th>
                <th className="px-4 py-3 font-medium">Start</th>
                <th className="px-4 py-3 font-medium">End</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.scheduleToday ?? []).map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{s.pitchName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.startTime?.slice(0, 5)}</td>
                  <td className="px-4 py-3 text-gray-600">{s.endTime?.slice(0, 5)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.isBooked ? 'booked' : 'available'} />
                  </td>
                  <td className="px-4 py-3 text-gray-700">{s.matchTitle ?? '—'}</td>
                </tr>
              ))}
              {!data.scheduleToday?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-sm text-gray-400">
                    No schedule for today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Recent Deposits</h2>
          <div className="divide-y divide-gray-100">
            {(data.recentDeposits ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-gray-900">{d.venueName ?? 'Settlement'}</div>
                  <div className="text-xs text-gray-500">Settlement #{d.id.slice(0, 8).toUpperCase()}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{formatMoney(d.amount)}</span>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
            {!data.recentDeposits?.length && (
              <div className="py-4 text-sm text-gray-400">No deposits yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
