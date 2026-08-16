'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarDays,
  MapPin,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useAdminData } from '@/lib/use-data';
import type { AdminMetrics } from '@/lib/types';
import { formatMoney, formatPercent } from '@/lib/utils';
import MetricCard from '@/components/MetricCard';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

export default function DashboardPage() {
  const { data, loading, error } = useAdminData<AdminMetrics>('/admin/metrics');
  const recentTx = useAdminData<{ transactions: { id: string; user_name: string | null; reference_type: string; amount: number; status: string }[] }>(
    '/admin/transactions?page=1&perPage=5',
  );
  const activeDisputes = useAdminData<{ disputes: { id: string; type: string; status: string; reporter_name: string | null }[] }>(
    '/admin/disputes?page=1&perPage=5',
  );

  if (loading) {
    return (
      <div>
        <PageHeader title="Mission Control" subtitle="Loading…" />
        <div className="p-8 text-sm text-gray-500">Loading metrics…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="Mission Control" />
        <div className="p-8 text-sm text-red-600">Failed to load metrics: {error}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Mission Control" subtitle="KoraLink operations overview" />

      <div className="space-y-6 p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Users" value={data.totals.users.toLocaleString()} icon={Users} />
          <MetricCard label="Matches Booked" value={data.totals.matches.toLocaleString()} icon={CalendarDays} />
          <MetricCard label="Venues" value={data.totals.venues.toLocaleString()} icon={MapPin} />
          <MetricCard
            label="Completion Rate"
            value={formatPercent(data.completionRate)}
            sub={`${formatPercent(data.disputeRate)} dispute rate`}
            icon={TrendingUp}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Total Float Held" value={formatMoney(data.totals.floatHeld)} icon={Wallet} />
          <MetricCard label="Pending Payouts" value={formatMoney(data.totals.pendingPayouts)} icon={Wallet} />
          <MetricCard label="Open Disputes" value={String(data.totals.disputesOpen)} icon={ShieldAlert} />
          <MetricCard
            label="Avg Resolution"
            value={`${data.avgResolutionHours.toFixed(1)}h`}
            icon={ShieldAlert}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Total Revenue (6 months)</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.revenueSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#0f9d58" strokeWidth={2} name="Revenue (SAR)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Matches Played vs Cancelled</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.matchesPlayedVsCancelled}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="played" fill="#0f9d58" name="Played" />
                  <Bar dataKey="cancelled" fill="#9ca3af" name="Cancelled" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Monthly Dispute Rate</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.disputeRateSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatPercent(v)} />
                <Tooltip formatter={(v: number) => formatPercent(v)} />
                <Line type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={2} name="Dispute rate" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Recent Transactions</h2>
            <div className="divide-y divide-gray-100">
              {(recentTx.data?.transactions ?? []).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{t.user_name ?? '—'}</div>
                    <div className="text-xs text-gray-500">{t.reference_type}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">{formatMoney(t.amount)}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </div>
              ))}
              {!recentTx.data?.transactions?.length && (
                <div className="py-4 text-sm text-gray-400">No transactions yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Active Disputes</h2>
            <div className="divide-y divide-gray-100">
              {(activeDisputes.data?.disputes ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{d.reporter_name ?? '—'}</div>
                    <div className="text-xs text-gray-500">{d.type.replace(/_/g, ' ')}</div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              ))}
              {!activeDisputes.data?.disputes?.length && (
                <div className="py-4 text-sm text-gray-400">No disputes.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
