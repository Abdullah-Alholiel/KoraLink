'use client';

import { Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import type { PartnerEarnings } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';

export default function PartnerEarningsPage() {
  const t = useTranslations('partner.earnings');
  const { data, loading, error } = useLiveAdminData<PartnerEarnings>('/partner/earnings', ['settlements']);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="space-y-6 p-8">
        {loading ? (
          <div className="text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <div className="text-sm text-red-600">{t('error', { error })}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
              <MetricCard label={t('totalPending')} value={formatMoney(data?.totalPending ?? 0)} icon={Wallet} />
              <MetricCard label={t('totalPaid')} value={formatMoney(data?.totalPaid ?? 0)} icon={Wallet} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('settlementsTitle')}</h2>
              <table className="w-full text-start text-sm">
                <thead className="border-y border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('thId')}</th>
                    <th className="px-4 py-3 font-medium">{t('thVenue')}</th>
                    <th className="px-4 py-3 font-medium">{t('thAmount')}</th>
                    <th className="px-4 py-3 font-medium">{t('thPeriod')}</th>
                    <th className="px-4 py-3 font-medium">{t('thStatus')}</th>
                    <th className="px-4 py-3 font-medium">{t('thPayoutRef')}</th>
                    <th className="px-4 py-3 font-medium">{t('thCreated')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.settlements ?? []).map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600" dir="ltr">#{s.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-gray-900">{s.venue_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{formatMoney(s.amount)}</td>
                      <td className="px-4 py-3 text-gray-600" dir="ltr">
                        {formatDate(s.period_start)} → {formatDate(s.period_end)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500" dir="ltr">{s.payout_ref ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500" dir="ltr">{formatDate(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.settlements?.length && (
                <div className="py-4 text-sm text-gray-400">{t('empty')}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
