'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Wrench, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import {
  BLACKOUT_MAX_DAYS,
  blackoutErrorKind,
  blackoutSpanDays,
  validateBlackoutRange,
  type BlackoutErrorKind,
  type BlackoutResult,
} from '@/lib/blackout';

interface BlackoutPanelProps {
  pitchId: string;
  onChanged: () => void;
}

/**
 * Bulk "close for maintenance" (P2-246 UI): deletes every FREE slot of the
 * pitch in an inclusive date range via POST /partner/pitches/:id/slots/blackout.
 * Booked slots are never touched — the server reports them as skippedBooked
 * and we surface that as a warning. Destructive → explicit confirm step.
 * Failures map to localized copy by status; raw backend text is never shown.
 */
export default function BlackoutPanel({ pitchId, onChanged }: BlackoutPanelProps) {
  const t = useTranslations('partner.blackout');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BlackoutResult | null>(null);
  const [failure, setFailure] = useState<BlackoutErrorKind | null>(null);

  const issue = validateBlackoutRange(from, to);
  const issueText =
    issue === 'order'
      ? t('errorOrder')
      : issue === 'tooLong'
        ? t('errorTooLong', { max: BLACKOUT_MAX_DAYS, days: blackoutSpanDays(from, to) })
        : null;

  async function submit() {
    setBusy(true);
    setFailure(null);
    setResult(null);
    try {
      const res = await api.post<BlackoutResult>(`/partner/pitches/${pitchId}/slots/blackout`, { from, to });
      setResult({ closedInstances: res?.closedInstances ?? 0, skippedBooked: res?.skippedBooked ?? 0 });
      onChanged();
    } catch (e) {
      setFailure(blackoutErrorKind(e));
    } finally {
      setBusy(false);
    }
  }

  const failureText =
    failure === 'range' ? t('failRange') : failure === 'access' ? t('failAccess') : failure === 'network' ? t('failNetwork') : null;

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
        {!open && (
          <button
            onClick={() => { setOpen(true); setResult(null); setFailure(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            <Wrench className="h-3.5 w-3.5" /> {t('open')}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('rangeTitle')}</h4>
            <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-gray-400 hover:text-gray-600" aria-label={tc('close')}><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">
              {t('from')}
              <input
                type="date"
                dir="ltr"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setFailure(null); setResult(null); }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-gray-500">
              {t('to')}
              <input
                type="date"
                dir="ltr"
                value={to}
                min={from || undefined}
                onChange={(e) => { setTo(e.target.value); setFailure(null); setResult(null); }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">{t('hint', { max: BLACKOUT_MAX_DAYS })}</p>
          {issueText && <p role="alert" className="mt-2 text-xs text-brand-red">{issueText}</p>}

          <button
            onClick={() => setConfirming(true)}
            disabled={busy || issue !== null}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
            {busy ? t('submitting') : t('submit')}
          </button>
        </div>
      )}

      {failureText && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{failureText}</p>
      )}

      {result && (
        <div role="status" className="mt-3 space-y-1.5">
          <p className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <CheckCircle2 className="h-3.5 w-3.5 text-brand-green" /> {t('success', { count: result.closedInstances })}
          </p>
          {result.skippedBooked > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {t('skippedBooked', { count: result.skippedBooked })}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={t('confirmTitle')}
        message={issue === null ? t('confirmMsg', { from, to, days: blackoutSpanDays(from, to) }) : undefined}
        confirmLabel={t('confirmLabel')}
        danger
        onConfirm={submit}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
