'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, Pencil, RotateCcw, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLiveAdminData } from '@/lib/use-live-data';
import { api } from '@/lib/api';
import type { AdminReportDetail } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import ConfirmDialog from '@/components/ConfirmDialog';

const CLOSED = new Set(['resolved', 'dismissed']);

export default function ReportDetailPage() {
  const t = useTranslations('adminReports');
  const tc = useTranslations('common');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const { data, loading, error, reload } = useLiveAdminData<AdminReportDetail>(`/admin/reports/${id}`, ['reports']);

  const [outcome, setOutcome] = useState<'resolved' | 'dismissed'>('resolved');
  const [resolution, setResolution] = useState('');
  const [banSubject, setBanSubject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit-outcome mode (available in ANY status).
  const [editing, setEditing] = useState(false);
  const [editResolution, setEditResolution] = useState('');
  const [confirmReopen, setConfirmReopen] = useState(false);

  async function resolve() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.post(`/admin/reports/${id}/resolve`, { outcome, resolution, banSubject });
      reload();
      setResolution('');
      setBanSubject(false);
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
      await api.post(`/admin/reports/${id}/reopen`);
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
      await api.patch(`/admin/reports/${id}`, { resolution: editResolution });
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
  // Narrowed alias for closures.
  const d = data;
  const statusLabel =
    d.status === 'resolved' ? t('statusResolved') : d.status === 'dismissed' ? t('statusDismissed') : d.status.replace(/_/g, ' ');
  const isUserSubject = d.subject_type === 'user';

  function startEdit() {
    setEditResolution(d.resolution ?? '');
    setEditing(true);
  }

  return (
    <div>
      <PageHeader
        title={`${t('title')} #${d.id.slice(0, 8).toUpperCase()}`}
        subtitle={`${d.subject_type} · ${formatDate(d.created_at)}`}
        actions={
          <button onClick={() => router.push('/reports')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
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
                <dd className="mt-0.5 text-gray-900">
                  {d.reporter?.full_name ?? d.reporter?.handle ?? d.reporter?.phone ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{t('status')}</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={d.status} />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">{t('subject')}</dt>
                <dd className="mt-0.5 flex items-center gap-2 text-gray-900">
                  <span>{d.subject.label}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    {d.subject.type} · {d.subject.status}
                  </span>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">{t('reason')}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{d.reason}</dd>
              </div>
              {d.resolution && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">{t('resolution')}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-gray-700">{d.resolution}</dd>
                </div>
              )}
              {d.resolvedBy && (
                <div>
                  <dt className="text-xs text-gray-500">{t('resolvedBy')}</dt>
                  <dd className="mt-0.5 text-gray-900">{d.resolvedBy.full_name ?? '—'}</dd>
                </div>
              )}
              {d.resolved_at && (
                <div>
                  <dt className="text-xs text-gray-500">{t('resolvedAt')}</dt>
                  <dd className="mt-0.5 text-gray-900">{formatDate(d.resolved_at)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('decisionPanel')}</h2>

            {editing ? (
              <div className="space-y-3">
                <textarea
                  value={editResolution}
                  onChange={(e) => setEditResolution(e.target.value)}
                  placeholder={t('resolutionPh')}
                  className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                  rows={3}
                />
                {saveError && <p className="text-sm text-brand-red">{saveError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {tc('cancel')}
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
                    onClick={() => setOutcome('dismissed')}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                      outcome === 'dismissed' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {t('dismissBtn')}
                  </button>
                </div>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder={t('resolutionPh')}
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
                    {t('banSubject')}
                  </label>
                )}
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
