'use client';

import { CalendarClock, TrendingUp, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { PartnerDashboard } from '@/lib/types';
import { formatMoney, formatPercent } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';

export default function PartnerDashboardPage() {
  const t = useTranslations('partner.dashboard');
  const { data, loading, error } = useLiveAdminData<PartnerDashboard>('/partner/dashboard', ['matches', 'settlements', 'venues']);

  if (loading) {
    return (
      <div>
        <PageHeader title={t('title')} subtitle={t('loading')} />
        <div className="p-8 text-sm text-gray-500">{t('loading')}</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <div className="p-8 text-sm text-red-600">{t('error', { error })}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('welcome', { names: data.venueNames.join('، ') || t('fallbackVenue') })}
      />

      <div className="space-y-6 p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label={t('utilizationToday')} value={formatPercent(data.todayUtilization)} icon={TrendingUp} />
          <MetricCard label={t('upcomingMatches')} value={String(data.upcomingMatches)} icon={CalendarClock} />
          <MetricCard label={t('revenueToday')} value={formatMoney(data.revenueToday)} icon={Wallet} />
          <MetricCard
            label={t('nextMatch')}
            value={data.nextMatchInMinutes != null ? t('inMinutes', { mins: data.nextMatchInMinutes }) : '—'}
            icon={CalendarClock}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('scheduleTitle')}</h2>
          <table className="w-full text-start text-sm">
            <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t('thPitch')}</th>
                <th className="px-4 py-3 font-medium">{t('thStart')}</th>
                <th className="px-4 py-3 font-medium">{t('thEnd')}</th>
                <th className="px-4 py-3 font-medium">{t('thStatus')}</th>
                <th className="px-4 py-3 font-medium">{t('thMatch')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.scheduleToday ?? []).map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{s.pitchName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600" dir="ltr">{s.startTime?.slice(0, 5)}</td>
                  <td className="px-4 py-3 text-gray-600" dir="ltr">{s.endTime?.slice(0, 5)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.isBooked ? 'booked' : 'available'} />
                  </td>
                  <td className="px-4 py-3 text-gray-700">{s.matchTitle ?? '—'}</td>
                </tr>
              ))}
              {!data.scheduleToday?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-sm text-gray-400">
                    {t('noSchedule')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('depositsTitle')}</h2>
          <div className="divide-y divide-gray-100">
            {(data.recentDeposits ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-gray-900">{d.venueName ?? t('settlementFallback')}</div>
                  <div className="text-xs text-gray-500" dir="ltr">{t('settlementRef', { ref: d.id.slice(0, 8).toUpperCase() })}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">{formatMoney(d.amount)}</span>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
            {!data.recentDeposits?.length && (
              <div className="py-4 text-sm text-gray-400">{t('noDeposits')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
