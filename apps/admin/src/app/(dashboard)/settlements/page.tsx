'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Download, Loader2, Send } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import LiveBadge from '@/components/LiveBadge';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import { api, ApiError } from '@/lib/api';
import type { Settlement, ListResponse } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import DataTable, { type ColumnDef } from '@/components/DataTable';
import RecordDrawer from '@/components/RecordDrawer';
import SortSelect from '@/components/SortSelect';
import { trackEvent } from '@/providers/ObservabilityProvider';
import { csvAmount, csvDate } from '@/lib/csv-export';
import { useExportFeedback, ExportFeedbackNote } from '@/lib/use-export-feedback';

type SettlementsResponse = ListResponse<Settlement> & { settlements: Settlement[] };

export default function SettlementsPage() {
  const t = useTranslations('hq');
  const ts = useTranslations('status');
  const tl = useTranslations('list');
  const tc = useTranslations('common');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Settlement | null>(null);
  // P2-267: pay()/generate() previously had try/finally with NO catch — a
  // failed POST rejected unhandled, the drawer stayed open with only a
  // spinner reset, and the operator got zero feedback. Failures now map to
  // localized buckets by HTTP status (BlackoutPanel pattern); raw backend
  // text is never rendered.
  const [payFailure, setPayFailure] = useState<'auth' | 'access' | 'server' | 'network' | null>(null);
  const [generateFailure, setGenerateFailure] = useState<'auth' | 'access' | 'server' | 'network' | null>(null);
  const [paySeq, setPaySeq] = useState(0);
  const [generateSeq, setGenerateSeq] = useState(0);

  const sortParts = sort ? sort.split(':') : null;
  const sortField = sortParts?.[0] ?? '';
  const sortDir = sortParts?.[1] ?? '';

  const qs = new URLSearchParams({ page: String(page), perPage: '20' });
  if (status) qs.set('status', status);
  if (sortField) qs.set('sortBy', sortField);
  if (sortDir) qs.set('dir', sortDir);

  const { data, loading, error, reload, live, stale } = useLiveAdminData<SettlementsResponse>(`/admin/settlements?${qs.toString()}`);

  async function pay(id: string) {
    setBusyId(id);
    setPayFailure(null);
    try {
      await api.post(`/admin/settlements/${id}/pay`);
      reload();
      setSelected(null);
      trackEvent('admin_settlement_pay_success', { page: 'admin.settlements' });
    } catch (err) {
      // P2-267: surface the failure — never an unhandled rejection. Sentry
      // sees it through the api-client hook; PostHog gets the operator event.
      trackEvent('admin_settlement_pay_failed', { page: 'admin.settlements' });
      const status = err instanceof ApiError ? err.status : 0;
      setPayFailure(
        status === 401 ? 'auth'
          : status === 403 || status === 404 ? 'access'
            : status === 429 || status >= 500 ? 'server'
              : 'network',
      );
      setPaySeq((s) => s + 1);
    } finally {
      setBusyId(null);
    }
  }

  async function generate() {
    setGenerating(true);
    setGenerateFailure(null);
    try {
      await api.post('/admin/settlements/generate');
      reload();
      trackEvent('admin_settlement_generate_success', { page: 'admin.settlements' });
    } catch (err) {
      trackEvent('admin_settlement_generate_failed', { page: 'admin.settlements' });
      const status = err instanceof ApiError ? err.status : 0;
      setGenerateFailure(
        status === 401 ? 'auth'
          : status === 403 || status === 404 ? 'access'
            : status === 429 || status >= 500 ? 'server'
              : 'network',
      );
      setGenerateSeq((s) => s + 1);
    } finally {
      setGenerating(false);
    }
  }

  const columns: ColumnDef<Settlement>[] = [
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
      key: 'id',
      header: t('thId'),
      role: 'detail',
      render: (s) => <span dir="ltr">{`#${s.id.slice(0, 8).toUpperCase()}`}</span>,
    },
  ];

  const sortOptions = [
    { value: '', label: tl('sortNewest') },
    { value: 'created_at:asc', label: tl('sortOldest') },
    { value: 'amount:desc', label: tl('sortAmountHigh') },
    { value: 'amount:asc', label: tl('sortAmountLow') },
  ];

  const rows = data?.settlements ?? [];
  const exportFeedback = useExportFeedback();
  const exportDisabled = loading || !!error || rows.length === 0 || exportFeedback.exporting;


  // P2-147: export the FULL filtered set (same filters/sort as the table),
  // not just the rendered page.
  async function onExport() {
    const exported = await exportFeedback.runFullExport<SettlementsResponse, Settlement>({
      url: `/admin/settlements?${qs.toString()}`,
      rowKey: 'settlements',
      build: (allRows) => ({
        columns: [
          { key: 'venue', header: t('thVenue'), value: (s: Settlement) => s.venue_name ?? '' },
          { key: 'amount', header: t('thAmount'), value: (s: Settlement) => csvAmount(s.amount) },
          { key: 'status', header: t('thStatus') },
          {
            key: 'period',
            header: t('thPeriod'),
            value: (s: Settlement) => `${csvDate(s.period_start)} → ${csvDate(s.period_end)}`,
          },
          { key: 'payoutRef', header: t('thPayoutRef'), value: (s: Settlement) => s.payout_ref ?? '' },
          { key: 'id', header: t('thId') },
        ],
        rows: allRows,
        filePrefix: 'koralink-settlements',
        timestamp: new Date(),
      }),
    });
    if (exported !== null) trackEvent('admin_csv_export', { page: 'admin.settlements', rows: exported });
  }

  function onSortChange(v: string) {
    setSort(v);
    setPage(1);
    if (v) {
      const [field, dir] = v.split(':');
      trackEvent('admin_list_sort', { page: 'admin.settlements', sortBy: field, dir });
    }
  }

  return (
    <div>
      <PageHeader title={t('settlementsTitle')} subtitle={t('settlementsSubtitle')} actions={<LiveBadge live={live} stale={stale} />} />

      <div className="flex flex-wrap items-center gap-3 px-8 py-4">
        <select aria-label={tc('filterByStatus')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">{t('allStatuses')}</option>
          <option value="pending">{ts('pending')}</option>
          <option value="paid">{ts('paid')}</option>
          <option value="failed">{ts('failed')}</option>
        </select>
        <SortSelect value={sort} options={sortOptions} onChange={onSortChange} />
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-label={tc('exportCsv')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {t('exportSettlements')}
        </button>
        <button
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {t('generatePayouts')}
        </button>
      </div>

      {/* shared always-mounted live-region pair (success polite /
           error assertive) — markup lives beside the hook */}
      <ExportFeedbackNote feedback={exportFeedback} />

      {/* P2-267: generate-failure alert — key={seq} remounts the node so
          screen readers re-announce on each failure (role=alert). Hidden,
          never unmounted, when there is no failure to show. */}
      <p role="alert" key={`gen-${generateSeq}`} className="mx-8 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" style={{ display: generateFailure ? undefined : 'none' }}>
        {generateFailure === 'auth' ? t('generateFailedAuth')
          : generateFailure === 'access' ? t('generateFailedAccess')
            : generateFailure === 'server' ? t('generateFailedServer')
              : t('generateFailedNetwork')}
      </p>

      {loading ? (
        <div className="px-8 py-10 text-sm text-gray-500">{t('loadingSettlements')}</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} className="mx-8 my-10" />
      ) : (
        <>
          <div className="px-8">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(s) => s.id}
              onRowClick={(s) => setSelected(s)}
              empty={<EmptyState message={tc('noData')} />}
            />
          </div>
          <Pagination page={page} perPage={20} total={data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <RecordDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        page="admin.settlements"
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
                {
                  // P2-250 (PR-Agent r2 on PR #170): gate the provenance on
                  // requested_by ITSELF — a partner-requested row whose user
                  // row lost/never had a full_name must NOT read as
                  // "Auto-generated"; fall back to the id, which is still
                  // proof of a human requester.
                  label: t('thRequestedBy'),
                  value: selected.requested_by ? (
                    <span dir="auto">{selected.requested_by_name ?? `#${selected.requested_by.slice(0, 8).toUpperCase()}`}</span>
                  ) : (
                    t('requestedByAuto')
                  ),
                },
              ]
            : []
        }
        actions={
          selected && selected.status === 'pending' ? (
            <>
              {/* P2-267: pay failure alert INSIDE the drawer (the button's
                  surface) — mounts on failure so role=alert announces it;
                  w-full + flex-wrap stacks it above the action button. */}
              {payFailure && (
                <p role="alert" key={`pay-${paySeq}`} className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                  {payFailure === 'auth' ? t('payFailedAuth')
                    : payFailure === 'access' ? t('payFailedAccess')
                      : payFailure === 'server' ? t('payFailedServer')
                        : t('payFailedNetwork')}
                </p>
              )}
              {busyId === selected.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <button
                  onClick={() => pay(selected.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                >
                  <Send className="h-3.5 w-3.5" /> {t('payAction')}
                </button>
              )}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
