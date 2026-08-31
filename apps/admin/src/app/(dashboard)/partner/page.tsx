'use client';

import Link from 'next/link';
import { CalendarClock, ChevronRight, MapPin, Plus, TrendingUp, Users, Wallet, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { PartnerDashboard } from '@/lib/types';
import { formatMoney, formatPercent } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';
import WeeklyTrendChart from '@/components/WeeklyTrendChart';

export default function PartnerDashboardPage() {
  const t = useTranslations('partner.dashboard');
  const t2 = useTranslations('partner.dashboard2');
  const { data, loading, error, reload } = useLiveAdminData<PartnerDashboard>('/partner/dashboard', [
    'matches',
    'settlements',
    'venues',
  ]);

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
        <div className="p-8 text-sm text-brand-red">{t('error', { error })}</div>
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
        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t2('quickActions')}</span>
          <Link
            href="/partner/pitches"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-3.5 w-3.5" /> {t2('addPitch')}
          </Link>
          <Link
            href="/partner/pitches"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700"
          >
            <Zap className="h-3.5 w-3.5" /> {t2('manageSchedules')}
          </Link>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <MetricCard label={t('utilizationToday')} value={formatPercent(data.todayUtilization)} icon={TrendingUp} />
          <MetricCard label={t('upcomingMatches')} value={String(data.upcomingMatches)} icon={CalendarClock} />
          <MetricCard label={t('revenueToday')} value={formatMoney(data.revenueToday)} icon={Wallet} />
          <MetricCard
            label={t('nextMatch')}
            value={data.nextMatchInMinutes != null ? t('inMinutes', { mins: data.nextMatchInMinutes }) : '—'}
            icon={CalendarClock}
          />
          <MetricCard label={t2('venuesLabel')} value={String(data.venueCount)} icon={MapPin} />
          <MetricCard label={t2('pitchesLabel')} value={String(data.pitchCount)} icon={Users} />
        </div>

        {/* Upcoming matches */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">{t2('upcomingTitle')}</h2>
          {(data.upcomingList ?? []).length === 0 ? (
            <p className="py-4 text-sm text-gray-400">{t2('upcomingEmpty')}</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(data.upcomingList ?? []).map((m) => (
                <Link
                  key={m.id}
                  href={`/partner/matches/${m.id}`}
                  className="group flex items-center justify-between gap-4 py-3 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{m.title}</div>
                    <div className="text-xs text-gray-500">
                      {m.pitchName ?? '—'}
                      {' · '}
                      <span dir="ltr">{new Date(m.scheduledAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <span className="text-xs text-gray-500" dir="ltr">
                      {m.playersFilled}/{m.maxPlayers}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 7-day trend */}
        <WeeklyTrendChart data={data.weeklyTrend ?? []} />

        {/* Today's schedule */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('scheduleTitle')}</h2>
          <table className="w-full text-start text-sm">
            <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t('thPitch')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('thStart')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('thEnd')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('thStatus')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('thMatch')}</th>
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

        {/* Recent deposits */}
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
