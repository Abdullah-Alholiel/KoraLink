'use client';

import { useTranslations } from 'next-intl';
import { Trophy, Loader2 } from 'lucide-react';
import type { PomCandidate } from '@/hooks/usePom';
import Portal from '@/components/layout/Portal';

interface PomConfirmModalProps {
  open: boolean;
  candidate: PomCandidate | null;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

/**
 * Confirmation dialog shown ABOVE the POTM voting sheet.
 *
 * iOS-critical: this dialog must overlay the voting sheet (a portaled
 * `BottomSheet` at body-level z-[70]). A `position: fixed` element rendered
 * inline inside the page's scroll-container is trapped in that scroller's
 * stacking context on iOS WebKit and paints BELOW the sheet — invisible and
 * untappable. Rendering through a portal to `document.body` keeps it in the
 * root stacking context at z-[80]/z-[90], above every sheet.
 *
 * The `animate-scale-in` transform lives on the inner card (never on the
 * `fixed` wrapper — a transform on a fixed element re-anchors it on iOS).
 */
export default function PomConfirmModal({
  open,
  candidate,
  onConfirm,
  onCancel,
  isPending,
}: PomConfirmModalProps) {
  const t = useTranslations('pom');

  if (!open || !candidate) return null;

  return (
    <Portal>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[80] animate-fade-in"
        onClick={isPending ? undefined : onCancel}
      />

      {/* Modal — fixed wrapper has NO transform; inner card animates */}
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-5">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={t('title')}
          className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-scale-in"
        >
          {/* Trophy icon */}
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-brand-green/10 flex items-center justify-center">
              <Trophy className="w-7 h-7 text-brand-green" strokeWidth={2} />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-base font-bold text-brand-black text-center mb-2">
            {t('title')}
          </h3>

          {/* Candidate info */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 mb-4">
            {candidate.avatarUrl ? (
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={candidate.avatarUrl}
                  alt={candidate.fullName}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                <span className="text-base font-bold text-brand-green">
                  {candidate.fullName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brand-black truncate">
                {candidate.fullName}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('voteConfirmBody', { name: candidate.fullName })}
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isPending}
              className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600
                hover:bg-gray-50 active:scale-[0.98] transition-all
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('voteCancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              className="flex-1 py-3 rounded-2xl bg-brand-green text-white text-sm font-bold
                shadow-[0_4px_20px_rgba(37,65,50,0.4)]
                active:scale-[0.98] transition-transform
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
                  {t('casting')}
                </>
              ) : (
                t('confirmVote')
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
