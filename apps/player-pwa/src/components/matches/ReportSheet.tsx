'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Flag, Loader2, X } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';
import { useReport, type ReportSubjectType } from '@/hooks/useReports';

interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  subjectType: ReportSubjectType;
  subjectId: string;
  subjectLabel: string;
}

/**
 * Reusable report sheet — submits POST /reports for a given subject
 * (user / match / venue). Shows a success state once submitted.
 */
export default function ReportSheet({
  open,
  onClose,
  subjectType,
  subjectId,
  subjectLabel,
}: ReportSheetProps) {
  const t = useTranslations('report');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const report = useReport();

  useEffect(() => {
    if (open) {
      setReason('');
      setSubmitted(false);
    }
  }, [open]);

  if (!open) return null;

  function submit() {
    if (!reason.trim() || report.isPending) return;
    report.mutate(
      { subjectType, subjectId, reason: reason.trim() },
      { onSuccess: () => setSubmitted(true) },
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} widthClass="max-w-xl">
      <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
        <div className="w-8" />
        <h2 className="text-lg font-bold text-brand-black">{t('title')}</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
        </button>
      </div>

      {submitted ? (
        <div className="flex-1 min-h-0 px-5 pb-6 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-7 h-7 text-brand-green" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-semibold text-brand-black">{t('submittedTitle')}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t('submittedDesc')}</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 pb-4">
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <Flag className="w-7 h-7 text-brand-red" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-brand-black text-center">{subjectLabel}</p>
              <p className="text-xs text-gray-500 text-center mt-1 leading-relaxed">{t('subtitle')}</p>
            </div>

            <div className="mt-5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                {t('reasonLabel')}
              </label>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 focus-within:border-brand-green transition-colors px-4 py-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder={t('reasonPlaceholder')}
                  className="w-full text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent resize-none"
                />
              </div>
              <div className="flex justify-end mt-1">
                <span className="text-[10px] text-gray-300" dir="ltr">
                  {reason.length}/1000
                </span>
              </div>
            </div>

            {report.isError && (
              <p className="text-xs text-brand-red mt-2 bg-brand-red/5 rounded-xl px-3 py-2">
                {report.error?.message}
              </p>
            )}
          </div>

          <div className="px-5 pb-8 pt-1 flex-shrink-0">
            <button
              onClick={submit}
              disabled={report.isPending || !reason.trim()}
              className="w-full py-4 rounded-2xl bg-brand-red text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {report.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('submit')}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
