'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminReportDetail } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const { data, loading, error, reload } = useLiveAdminData<AdminReportDetail>(
    `/admin/reports/${id}`,
    ['reports'],
  );

  const [outcome, setOutcome] = useState<'resolved' | 'dismissed'>('resolved');
  const [resolution, setResolution] = useState('');
  const [banSubject, setBanSubject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function resolve() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.post(`/admin/reports/${id}/resolve`, { outcome, resolution, banSubject });
      reload();
      setResolution('');
      setBanSubject(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to resolve');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Report" subtitle="Loading…" />
        <div className="p-8 text-sm text-gray-500">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title="Report" />
        <div className="p-8 text-sm text-red-600">Failed to load: {error}</div>
      </div>
    );
  }

  const closed = data.status === 'resolved' || data.status === 'dismissed';
  const isUserSubject = data.subject_type === 'user';

  return (
    <div>
      <PageHeader
        title={`Report #${data.id.slice(0, 8).toUpperCase()}`}
        subtitle={`${data.subject_type} · ${formatDate(data.created_at)}`}
        actions={
          <button onClick={() => router.push('/reports')} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to reports
          </button>
        }
      />

      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Case details</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Reporter</dt>
                <dd className="mt-0.5 text-gray-900">
                  {data.reporter?.full_name ?? data.reporter?.handle ?? data.reporter?.phone ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Status</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={data.status} />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Reported subject</dt>
                <dd className="mt-0.5 flex items-center gap-2 text-gray-900">
                  <span>{data.subject.label}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    {data.subject.type} · {data.subject.status}
                  </span>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Reason</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{data.reason}</dd>
              </div>
              {data.resolution && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Resolution</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{data.resolution}</dd>
                </div>
              )}
              {data.resolvedBy && (
                <div>
                  <dt className="text-xs text-gray-500">Resolved by</dt>
                  <dd className="mt-0.5 text-gray-900">{data.resolvedBy.full_name ?? '—'}</dd>
                </div>
              )}
              {data.resolved_at && (
                <div>
                  <dt className="text-xs text-gray-500">Resolved at</dt>
                  <dd className="mt-0.5 text-gray-900">{formatDate(data.resolved_at)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Decision panel</h2>
            {closed ? (
              <p className="text-sm text-gray-500">This report has been {data.status}.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setOutcome('resolved')}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                      outcome === 'resolved' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => setOutcome('dismissed')}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                      outcome === 'dismissed' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    Dismiss
                  </button>
                </div>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder='Resolution note, e.g. "Banned user for abusive messages"'
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={3}
                />
                {isUserSubject && outcome === 'resolved' && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={banSubject}
                      onChange={(e) => setBanSubject(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Also ban this user
                  </label>
                )}
                {saveError && <p className="text-sm text-red-600">{saveError}</p>}
                <button
                  onClick={resolve}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Submit decision
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
