'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useAdminData } from '@/lib/use-data';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

interface DisputeDetail {
  id: string;
  type: string;
  status: string;
  decision: string | null;
  internal_note: string | null;
  policy_ref: string | null;
  evidence: unknown;
  created_at: string;
  reporter: { full_name: string | null; phone: string | null } | null;
  respondent: { full_name: string | null; phone: string | null } | null;
  match: { title: string | null; status: string | null; scheduled_at: string | null } | null;
  messages: { id: string; content: string; created_at: string; author: { full_name: string | null } }[];
}

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data, loading, error, reload } = useAdminData<DisputeDetail>(`/admin/disputes/${id}`);

  const [outcome, setOutcome] = useState<'resolved' | 'rejected'>('resolved');
  const [decision, setDecision] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function resolve() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.post(`/admin/disputes/${id}/resolve`, { outcome, decision, internalNote });
      reload();
      setDecision('');
      setInternalNote('');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to resolve');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Dispute" subtitle="Loading…" />
        <div className="p-8 text-sm text-gray-500">Loading…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title="Dispute" />
        <div className="p-8 text-sm text-red-600">Failed to load: {error}</div>
      </div>
    );
  }

  const closed = data.status === 'resolved' || data.status === 'rejected';

  return (
    <div>
      <PageHeader
        title={`Dispute #${data.id.slice(0, 8).toUpperCase()}`}
        subtitle={`${data.type.replace(/_/g, ' ')} · ${formatDate(data.created_at)}`}
        actions={
          <button onClick={() => router.push('/disputes')} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to disputes
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
                <dd className="mt-0.5 text-gray-900">{data.reporter?.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Respondent</dt>
                <dd className="mt-0.5 text-gray-900">{data.respondent?.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Match</dt>
                <dd className="mt-0.5 text-gray-900">{data.match?.title ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Status</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={data.status} />
                </dd>
              </div>
              {data.policy_ref && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Policy reference</dt>
                  <dd className="mt-0.5 text-gray-700">{data.policy_ref}</dd>
                </div>
              )}
              {data.decision && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Decision</dt>
                  <dd className="mt-0.5 text-gray-700">{data.decision}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Conversation</h2>
            <div className="space-y-3">
              {(data.messages ?? []).map((m) => (
                <div key={m.id} className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-900">{m.author?.full_name ?? 'Unknown'}</span>
                    <span className="text-xs text-gray-400">{formatDate(m.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{m.content}</p>
                </div>
              ))}
              {!data.messages?.length && (
                <p className="text-sm text-gray-400">No messages recorded.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Decision panel</h2>
            {closed ? (
              <p className="text-sm text-gray-500">This dispute has been {data.status}.</p>
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
                    onClick={() => setOutcome('rejected')}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                      outcome === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    Reject
                  </button>
                </div>
                <textarea
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  placeholder='Decision, e.g. "Uphold penalty (win for host)"'
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={2}
                />
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Internal note (admins only)"
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={2}
                />
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
