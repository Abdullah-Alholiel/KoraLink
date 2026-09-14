'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import LoadError from '@/components/LoadError';
import EmptyState from '@/components/EmptyState';
import { api } from '@/lib/api';
import type { AdminVenueDetail } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

/**
 * Venue detail + approval surface. P2-61 (run #52): was ~19 hardcoded English
 * literals — the approve/reject decision surface broke the AR console entirely.
 * All copy now routes through the `venueDetail` namespace (+ hq.approve/reject,
 * common.loading reuse). A failed approval decision renders a localized inline
 * alert (role=alert) per the error-message standard — never a silent no-op.
 */
export default function VenueDetailPage() {
  const t = useTranslations('venueDetail');
  const tHQ = useTranslations('hq');
  const tc = useTranslations('common');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const { data, loading, error, reload } = useLiveAdminData<AdminVenueDetail>(`/admin/venues/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setActionError(false);
    try {
      await api.post(`/admin/venues/${id}/decision`, { decision });
      reload();
    } catch {
      // what happened + what next, localized — never raw backend text.
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('venue')} subtitle={tc('loading')} />
        <div className="p-8 text-sm text-gray-500">{tc('loading')}</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title={t('venue')} />
        <LoadError error={error} onRetry={reload} className="m-8" />
      </div>
    );
  }

  const v = data.verification;

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={`${data.city} · ${data.address}`}
        actions={
          <button onClick={() => router.push('/venues')} className="text-sm text-gray-500 hover:text-gray-700">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t('backToVenues')}
          </button>
        }
      />

      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('venue')}</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500">{tHQ('thApproved')}</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={data.is_approved ? 'approved' : 'pending'} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('partner')}</dt>
                <dd className="mt-0.5 text-gray-900">{data.is_koralink_partner ? t('yes') : t('no')}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('owner')}</dt>
                <dd className="mt-0.5 text-gray-900">{data.owner?.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('rating')}</dt>
                <dd className="mt-0.5 text-gray-900">{String(data.rating ?? '—')}</dd>
              </div>
            </dl>

            <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('pitches')}</h3>
            <ul className="divide-y divide-gray-100 text-sm">
              {(data.pitches ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span className="text-gray-900">
                    {p.name} <span className="text-xs text-gray-500">({p.size} · {p.surface_type})</span>
                  </span>
                  <span className="text-gray-700">{formatMoney(p.hourly_rate)}{t('perHour')}</span>
                </li>
              ))}
              {!data.pitches?.length && <li className="py-2 text-sm text-gray-400">{t('noPitches')}</li>}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('verification')}</h2>
            {!v ? (
              <EmptyState message={t('noVerification')} />
            ) : (
              <>
                <div className="mb-3">
                  <StatusBadge status={v.status} />
                </div>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500">{t('legalEntity')}</dt>
                    <dd className="text-gray-900">{v.legal_entity_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{t('commercialReg')}</dt>
                    <dd className="text-gray-900">{v.commercial_reg ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{t('taxId')}</dt>
                    <dd className="text-gray-900">{v.tax_id ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{t('iban')}</dt>
                    <dd className="break-all text-gray-900">{v.iban ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">{t('manager')}</dt>
                    <dd className="text-gray-900">
                      {v.manager_name ?? '—'}
                      {v.manager_phone ? ` · ${v.manager_phone}` : ''}
                    </dd>
                  </div>
                </dl>
                {!data.is_approved && (
                  <div className="mt-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => decide('approve')}
                        disabled={busy}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {tHQ('approveAction')}
                      </button>
                      <button
                        onClick={() => decide('reject')}
                        disabled={busy}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" /> {tHQ('rejectAction')}
                      </button>
                    </div>
                    {actionError && (
                      <p role="alert" className="mt-2 text-xs text-red-600">
                        {t('decisionFailed')}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
