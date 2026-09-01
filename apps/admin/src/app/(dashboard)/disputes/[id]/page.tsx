'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, Pencil, RotateCcw, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import ConfirmDialog from '@/components/ConfirmDialog';

interface DisputeDetail {
  id: string;
  type: string;
  status: string;
  decision: string | null;
  internal_note: string | null;
  policy_ref: string | null;
  evidence: { action?: string; reason?: string; by?: string; at?: string }[] | unknown;
  created_at: string;
  reporter: { full_name: string | null; phone: string | null } | null;
  respondent: { full_name: string | null; phone: string | null } | null;
  match: { title: string | null; status: string | null; scheduled_at: string | null } | null;
  messages: { id: string; content: string; created_at: string; author: { full_name: string | null } }[];
}

function parseEvidence(evidence: unknown): { action?: string; reason?: string; at?: string }[] {
  if (Array.isArray(evidence)) return evidence as { action?: string; reason?: string; at?: string }[];
  return [];
}

const CLOSED = new Set(['resolved', 'rejected']);

export default function DisputeDetailPage() {
  const t = useTranslations('adminDisputes');
  const tc = useTranslations('common');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  // React 19 types: useParams() is nullable — defensive read (2d715a1 pattern).
  const id = params?.id ?? '';

  const { data, loading, error, reload } = useLiveAdminData<DisputeDetail>(`/admin/disputes/${id}`, ['disputes']);

  const [outcome, setOutcome] = useState<'resolved' | 'rejected'>('resolved');
  const [decision, setDecision] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Admin reply on the dispute thread (P2-2, run #24) ──
  const [reply, setReply] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  async function sendReply() {
    const content = reply.trim();
    if (!content || replySending) return;
    setReplySending(true);
    setReplyError(null);
    try {
      await api.post(`/admin/disputes/${id}/messages`, { content });
      reload();
      setReply('');
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : t('replyFailed'));
    } finally {
      setReplySending(false);
    }
  }

  // Edit-outcome mode (available in ANY status — post-decision corrections).
  const [editing, setEditing] = useState(false);
  const [editDecision, setEditDecision] = useState('');
  const [editNote, setEditNote] = useState('');
  const [confirmReopen, setConfirmReopen] = useState(false);

  async function resolve() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.post(`/admin/disputes/${id}/resolve`, { outcome, decision, internalNote });
      reload();
      setDecision('');
      setInternalNote('');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.post(`/admin/disputes/${id}/reopen`);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setSaving(false);
      setConfirmReopen(false);
    }
  }

  async function saveEdit() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.patch(`/admin/disputes/${id}`, {
        decision: editDecision,
        internalNote: editNote,
      });
      setEditing(false);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setSaving(false);
    }
  }

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
        <div className="p-8 text-sm text-brand-red">{t('loadFailed')}</div>
      </div>
    );
  }

  const closed = CLOSED.has(data.status);
  // Narrowed alias for closures (startEdit etc.).
  const d = data;
  const statusLabel =
    d.status === 'resolved' ? t('statusResolved') : d.status === 'rejected' ? t('statusRejected') : d.status.replace(/_/g, ' ');

  const evidence = parseEvidence(d.evidence);

  function evidenceLabel(action?: string): string {
    if (action === 'marked_no_show') return t('noShowMarked');
    if (action === 'appeal') return t('appeal');
    if (action === 'reopened') return t('reopened');
    return t('evidence');
  }

  function startEdit() {
    setEditDecision(d.decision ?? '');
    setEditNote(d.internal_note ?? '');
    setEditing(true);
  }

  return (
    <div>
      <PageHeader
        title={`${t('title')} #${data.id.slice(0, 8).toUpperCase()}`}
        subtitle={`${data.type.replace(/_/g, ' ')} · ${formatDate(data.created_at)}`}
        actions={
          <button onClick={() => router.push('/disputes')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('backToList')}
          </button>
        }
      />

      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('caseDetails')}</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500">{t('reporter')}</dt>
                <dd className="mt-0.5 text-gray-900">{data.reporter?.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('respondent')}</dt>
                <dd className="mt-0.5 text-gray-900">{data.respondent?.full_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('match')}</dt>
                <dd className="mt-0.5 text-gray-900">{data.match?.title ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('status')}</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={data.status} />
                </dd>
              </div>
              {data.policy_ref && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">{t('policyRef')}</dt>
                  <dd className="mt-0.5 text-gray-700">{data.policy_ref}</dd>
                </div>
              )}
              {data.decision && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">{t('decision')}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{data.decision}</dd>
                </div>
              )}
              {data.internal_note && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">{t('internalNote')}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{data.internal_note}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('timeline')}</h2>
            <div className="space-y-3">
              {evidence.map((e, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-900">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          e.action === 'appeal'
                            ? 'bg-blue-500'
                            : e.action === 'reopened'
                              ? 'bg-purple-500'
                              : 'bg-amber-500'
                        }`}
                      />
                      {evidenceLabel(e.action)}
                    </span>
                    {e.at && <span className="text-xs text-gray-400">{formatDate(e.at)}</span>}
                  </div>
                  {e.reason && <p className="text-sm text-gray-700">{e.reason}</p>}
                </div>
              ))}
              {!evidence.length && <p className="text-sm text-gray-400">{t('noEvidence')}</p>}
            </div>

            {data.messages?.length > 0 && (
              <>
                <h3 className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('followUps')}</h3>
                <div className="space-y-3">
                  {data.messages.map((m) => (
                    <div key={m.id} className="rounded-lg bg-gray-50 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-900">{m.author?.full_name ?? 'Unknown'}</span>
                        <span className="text-xs text-gray-400">{formatDate(m.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-700">{m.content}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Admin reply composer (P2-2, run #24) — always available; replies
                allowed in ANY dispute status (closing the loop after a decision
                is legitimate ops). */}
            <div className="mt-5 rounded-lg border border-gray-200 bg-white p-3">
              <label htmlFor="dispute-reply" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('replyTitle')}
              </label>
              <textarea
                id="dispute-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t('replyPlaceholder')}
                rows={2}
                maxLength={2000}
                className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              />
              {replyError && <p className="mt-2 text-sm text-brand-red">{replyError}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400">{reply.length}/2000</span>
                <button
                  onClick={sendReply}
                  disabled={replySending || reply.trim().length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {replySending ? t('replySending') : t('replySend')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('decisionPanel')}</h2>

            {editing ? (
              <div className="space-y-3">
                <textarea
                  value={editDecision}
                  onChange={(e) => setEditDecision(e.target.value)}
                  placeholder={t('decisionPh')}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={3}
                />
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder={t('notePh')}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={2}
                />
                {saveError && <p className="text-sm text-brand-red">{saveError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('backToList')}
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {tc('saveChanges')}
                  </button>
                </div>
              </div>
            ) : closed ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{t('closedAs', { status: statusLabel })}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmReopen(true)}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" /> {t('reopen')}
                  </button>
                  <button
                    onClick={startEdit}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4" /> {t('editOutcome')}
                  </button>
                </div>
                {saveError && <p className="text-sm text-brand-red">{saveError}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setOutcome('resolved')}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                      outcome === 'resolved' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {t('resolveBtn')}
                  </button>
                  <button
                    onClick={() => setOutcome('rejected')}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                      outcome === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {t('rejectBtn')}
                  </button>
                </div>
                <textarea
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  placeholder={t('decisionPh')}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={3}
                />
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder={t('notePh')}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={2}
                />
                {saveError && <p className="text-sm text-brand-red">{saveError}</p>}
                <button
                  onClick={resolve}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {t('submit')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReopen}
        title={t('reopenConfirmTitle')}
        message={t('reopenConfirmMsg')}
        confirmLabel={t('reopen')}
        danger
        onConfirm={reopen}
        onClose={() => setConfirmReopen(false)}
      />
    </div>
  );
}
