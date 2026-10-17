'use client';

import { useState } from 'react';
import { Download, Gauge, TrendingUp, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import type { PartnerEarnings, PartnerVenueRevenue } from '@/lib/types';
import { formatDate, formatMoney, formatPercent } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import StatusBadge from '@/components/StatusBadge';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import WeeklyTrendChart from '@/components/WeeklyTrendChart';
import {
  buildCsvExport,
  csvAmount,
  csvDate,
  csvFilename,
  type CsvExportFile,
} from '@/lib/csv-export';
import { useExportFeedback, ExportFeedbackNote } from '@/lib/use-export-feedback';
import { trackEvent } from '@/providers/ObservabilityProvider';
import * as Sentry from '@sentry/nextjs';

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
  const ef = useExportFeedback();

  // P2-178: one CSV with two sections — per-venue revenue, then settlements.
  function buildEarningsCsv(earnings: PartnerEarnings): CsvExportFile {
    const timestamp = new Date();
    const revenue = buildCsvExport({
      columns: [
        { key: 'venue', header: t('thVenue') },
        { key: 'bookings', header: t('thBookings') },
        { key: 'revenue', header: t('thRevenue') },
      ],
      rows: (earnings.perVenue ?? []).map((v) => ({
        venue: v.venueName || '',
        bookings: v.bookedCount,
        revenue: csvAmount(v.revenue),
      })),
      filePrefix: 'koralink-partner-revenue',
      timestamp,
    });
    const settlements = buildCsvExport({
      columns: [
        { key: 'venue', header: t('thVenue') },
        { key: 'amount', header: t('thAmount') },
        { key: 'status', header: t('thStatus') },
        { key: 'period', header: t('thPeriod') },
        { key: 'payoutRef', header: t('thPayoutRef') },
        { key: 'created', header: t('thCreated') },
      ],
      rows: (earnings.settlements ?? []).map((s) => ({
        venue: s.venue_name ?? '',
        amount: csvAmount(s.amount),
        status: s.status,
        period: `${csvDate(s.period_start)} → ${csvDate(s.period_end)}`,
        payoutRef: s.payout_ref ?? '',
        created: csvDate(s.created_at),
      })),
      filePrefix: 'koralink-partner-settlements',
      timestamp,
    });
    // Section A keeps the file's only BOM; strip B's. buildCsvExport already
    // ends each section with CRLF (csv-export.ts), so the sections join
    // cleanly — no extra separator needed (PR-Agent r1 IMPORTANT refuted:
    // it assumed no trailing newline; csv-export.ts:77 emits one).
    return {
      filename: csvFilename('koralink-partner-earnings', timestamp),
      content: revenue.content + settlements.content.replace(/^\uFEFF/, ''),
    };
  }

  async function onExport() {
    if (!data) return;
    const rowCount = (data.perVenue?.length ?? 0) + (data.settlements?.length ?? 0);
    if (rowCount === 0) return;
    // Build inside the same failure envelope as runPrebuilt: a formatter
    // throw during generation must reach Sentry + the error note, not the
    // console (PR-Agent r1 MINOR).
    try {
      const built = buildEarningsCsv(data);
      // runPrebuilt returns success: the hook already fired the error note +
      // Sentry + error event on failure — success analytics must not fire too
      // (run-#138 Reviewer-A MINOR).
      if (ef.runPrebuilt(built, rowCount)) {
        trackEvent('admin_csv_export', { page: 'partner.earnings', rows: rowCount });
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { area: 'admin-csv-export' } });
      trackEvent('admin_csv_export_error', { page: 'partner.earnings' });
      ef.reportError();
    }
  }

  const exportDisabled =
    loading || !!error || ef.exporting || (data?.perVenue?.length ?? 0) + (data?.settlements?.length ?? 0) === 0;

  // P1-65: revenue overview — server-aggregated over the 4-week Riyadh window.
  const fourWeekTrend = data?.fourWeekTrend ?? [];
  const fourWeekRevenue = fourWeekTrend.reduce((sum, w) => sum + Number(w.revenue), 0);
  const trendPoints = fourWeekTrend.map((w) => ({
    date: w.weekStart,
    bookedSlots: w.bookedCount,
    revenue: Number(w.revenue),
  }));

  const venueColumns: ColumnDef<PartnerVenueRevenue>[] = [
    {
      key: 'venue',
      header: t('thVenue'),
      role: 'identity',
      render: (v) => <span className="font-medium text-gray-900">{v.venueName || '—'}</span>,
    },
    {
      key: 'bookings',
      header: t('thBookings'),
      role: 'value',
      align: 'end',
      tabular: true,
      render: (v) => v.bookedCount,
    },
    {
      key: 'revenue',
      header: t('thRevenue'),
      role: 'value',
      align: 'end',
      tabular: true,
      render: (v) => formatMoney(v.revenue),
    },
  ];

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
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExport}
              disabled={exportDisabled}
              aria-label={t('exportEarnings')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {t('exportEarnings')}
            </button>
            <LiveBadge live={live} stale={stale} />
          </div>
        }
      />
      <ExportFeedbackNote feedback={ef} />

      <div className="space-y-6 p-8">
        {loading ? (
          <div className="text-sm text-gray-500">{t('loading')}</div>
        ) : error ? (
          <LoadError error={error} onRetry={reload} className="my-10" />
        ) : (
          <>
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{t('revenueOverviewTitle')}</h2>
                <p className="mt-1 text-xs text-gray-500">{t('revenueOverviewSubtitle')}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
                <MetricCard label={t('fourWeekRevenue')} value={formatMoney(fourWeekRevenue)} icon={TrendingUp} />
                <MetricCard
                  label={t('utilization')}
                  value={formatPercent((data?.utilizationPct ?? 0) / 100)}
                  icon={Gauge}
                />
              </div>
              <WeeklyTrendChart data={trendPoints} />
              <div>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">{t('perVenueTitle')}</h3>
                <DataTable
                  columns={venueColumns}
                  rows={data?.perVenue ?? []}
                  rowKey={(v) => v.venueId}
                  empty={<p className="px-4 py-10 text-sm text-gray-400">{t('noRevenueData')}</p>}
                />
              </div>
            </section>

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
