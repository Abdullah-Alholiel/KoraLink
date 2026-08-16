'use client';

import { useTranslations } from 'next-intl';
import { X, Trophy, Crown } from 'lucide-react';
import type { PomResultRow } from '@/hooks/usePom';

interface PomResultsSheetProps {
  open: boolean;
  onClose: () => void;
  winner: { id: string; fullName: string; avatarUrl: string | null };
  results: PomResultRow[];
}

export default function PomResultsSheet({
  open,
  onClose,
  winner,
  results,
}: PomResultsSheetProps) {
  const t = useTranslations('pom');

  if (!open) return null;

  // Results excluding the winner = runners-up
  const runnersUp = results.filter((r) => r.id !== winner.id);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 inset-x-0 z-[70] flex justify-center max-w-6xl mx-auto px-0 md:px-4">
        <div className="w-full max-w-2xl bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[80dvh] overflow-y-auto pb-safe">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-lg font-bold text-brand-black">{t('title')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        <div className="px-5 pb-8 pb-safe">
          {/* Winner */}
          <div className="bg-gradient-to-b from-brand-green/5 to-white rounded-2xl border border-brand-green/10 p-5 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                <Crown className="w-6 h-6 text-brand-green" strokeWidth={2} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
                  {t('winner')}
                </p>
                <p className="text-base font-bold text-brand-black">{winner.fullName}</p>
              </div>
              <div className="text-end">
                <p className="text-xl font-extrabold text-brand-green" dir="ltr">
                  {results.find((r) => r.id === winner.id)?.voteCount ?? 0}
                </p>
                <p className="text-[10px] text-gray-400">{t('votes')}</p>
              </div>
            </div>
          </div>

          {/* Runners-up */}
          {runnersUp.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {t('runnerUp')}
              </p>
              <div className="space-y-2">
                {runnersUp.map((r, idx) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 bg-gray-50 rounded-xl p-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                      {idx + 2}
                    </div>
                    {r.avatarUrl ? (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.avatarUrl}
                          alt={r.fullName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-brand-green">
                          {r.fullName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="flex-1 text-sm font-medium text-brand-black">
                      {r.fullName}
                    </span>
                    <div className="flex items-center gap-1 text-xs font-bold text-gray-500">
                      <Trophy className="w-3 h-3 text-brand-green" strokeWidth={2} />
                      <span dir="ltr">{r.voteCount}</span> {t('votes')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {runnersUp.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">{t('noWinnerDescription')}</p>
          )}
        </div>
      </div>
    </div>
  </>
);
}
