'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminVenueDetail } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

export default function VenueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { data, loading, error, reload } = useLiveAdminData<AdminVenueDetail>(`/admin/venues/${id}`);
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    try {
      await api.post(`/admin/venues/${id}/decision`, { decision });
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Venue" subtitle="Loading…" />
        <div className="p-8 text-sm text-gray-500">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title="Venue" />
        <div className="p-8 text-sm text-red-600">Failed to load: {error}</div>
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
            ← Back to venues
          </button>
        }
      />

      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Venue</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Approved</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={data.is_approved ? 'approved' : 'pending'} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">KoraLink partner</dt>
                <dd className="mt-0.5 text-gray-900">{data.is_koralink_partner ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Owner</dt>
                <dd className="mt-0.5 text-gray-900">{data.owner?.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Rating</dt>
                <dd className="mt-0.5 text-gray-900">{String(data.rating ?? '—')}</dd>
              </div>
            </dl>

            <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Pitches</h3>
            <ul className="divide-y divide-gray-100 text-sm">
              {(data.pitches ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span className="text-gray-900">
                    {p.name} <span className="text-xs text-gray-500">({p.size} · {p.surface_type})</span>
                  </span>
                  <span className="text-gray-700">{formatMoney(p.hourly_rate)}/hr</span>
                </li>
              ))}
              {!data.pitches?.length && <li className="py-2 text-sm text-gray-400">No pitches yet.</li>}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Verification</h2>
            {!v ? (
              <p className="text-sm text-gray-400">No verification submitted yet.</p>
            ) : (
              <>
                <div className="mb-3">
                  <StatusBadge status={v.status} />
                </div>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500">Legal entity</dt>
                    <dd className="text-gray-900">{v.legal_entity_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Commercial reg</dt>
                    <dd className="text-gray-900">{v.commercial_reg ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Tax ID</dt>
                    <dd className="text-gray-900">{v.tax_id ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">IBAN</dt>
                    <dd className="break-all text-gray-900">{v.iban ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Manager</dt>
                    <dd className="text-gray-900">
                      {v.manager_name ?? '—'}
                      {v.manager_phone ? ` · ${v.manager_phone}` : ''}
                    </dd>
                  </div>
                </dl>
                {!data.is_approved && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => decide('approve')}
                      disabled={busy}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => decide('reject')}
                      disabled={busy}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
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
