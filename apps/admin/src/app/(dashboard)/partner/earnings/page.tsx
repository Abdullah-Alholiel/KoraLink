'use client';

import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import type { PartnerEarnings } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';

interface PartnerSettlement {
  id: string;
  venue_name?: string | null;
  amount: number | string;
  period_start: string;
  period_end: string;
  status: string;
  payout_ref?: string | null;
  created_at: string;
}

export default function PartnerEarningsPage() {
  const t = useTranslations('partner.earnings');
  const [selected, setSelected] = useState<PartnerSettlement | null>(null);
  const { data, loading, error, reload, live, stale } = useLiveAdminData<PartnerEarnings>('/partner/earnings', ['settlements']);

  const columns: ColumnDef<PartnerSettlement>[] = [
    {
      key: 'venue',
      header: t('thVenue'),
      role: 'identity',
      render: (s) => <span className="font-medium text-gray-900">{s.venue_name ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: t('thAmount'),
      role: 'value',
      align: 'end',
      tabular: true,
      render: (s) => formatMoney(s.amount),
    },
    {
      key: 'status',
      header: t('thStatus'),
      role: 'meta',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'period',
      header: t('thPeriod'),
      role: 'meta',
      cardLabel: t('thPeriod'),
      render: (s) => (
        <span dir="ltr">
          {formatDate(s.period_start)} → {formatDate(s.period_end)}
        </span>
      ),
    },
    {
      key: 'payoutRef',
      header: t('thPayoutRef'),
      role: 'detail',
      render: (s) => <span dir="ltr">{s.payout_ref ?? '—'}</span>,
    },
    {
      key: 'created',
      header: t('thCreated'),
      role: 'detail',
      render: (s) => <span dir="ltr">{formatDate(s.created_at)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      <div className="space-y-6 p-8">
        {loading ? (
          <div className="text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <LoadError error={error} onRetry={reload} className="my-10" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
              <MetricCard label={t('totalPending')} value={formatMoney(data?.totalPending ?? 0)} icon={Wallet} />
              <MetricCard label={t('totalPaid')} value={formatMoney(data?.totalPaid ?? 0)} icon={Wallet} />
            </div>

            <div>
              <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('settlementsTitle')}</h2>
              <DataTable
                columns={columns}
                rows={data?.settlements ?? []}
                rowKey={(s) => s.id}
                onRowClick={(s) => setSelected(s)}
                empty={<p className="px-4 py-10 text-sm text-gray-400">{t('empty')}</p>}
              />
            </div>
          </>
        )}
      </div>

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="partner.earnings"
        title={selected?.venue_name ?? t('thVenue')}
        recordId={selected?.id}
        fields={
          selected
            ? [
                { label: t('thVenue'), value: selected.venue_name ?? '—' },
                { label: t('thAmount'), value: formatMoney(selected.amount) },
                { label: t('thStatus'), value: <StatusBadge status={selected.status} /> },
                {
                  label: t('thPeriod'),
                  value: (
                    <span dir="ltr">
                      {formatDate(selected.period_start)} → {formatDate(selected.period_end)}
                    </span>
                  ),
                },
                { label: t('thPayoutRef'), value: <span dir="ltr">{selected.payout_ref ?? '—'}</span> },
                { label: t('thCreated'), value: <span dir="ltr">{formatDate(selected.created_at)}</span> },
              ]
            : []
        }
      />
    </div>
  );
}
