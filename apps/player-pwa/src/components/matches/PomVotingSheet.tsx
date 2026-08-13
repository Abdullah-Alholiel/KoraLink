'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Shield, Check } from 'lucide-react';
import type { PomCandidate } from '@/hooks/usePom';
import PomConfirmModal from './PomConfirmModal';

interface PomVotingSheetProps {
  open: boolean;
  onClose: () => void;
  candidates: PomCandidate[];
  hasVoted: boolean;
  votedFor: string | null;
  isPending: boolean;
  onVote: (candidateId: string) => void;
}

export default function PomVotingSheet({
  open,
  onClose,
  candidates,
  hasVoted,
  votedFor,
  isPending,
  onVote,
}: PomVotingSheetProps) {
  const t = useTranslations('pom');
  const [selectedCandidate, setSelectedCandidate] = useState<PomCandidate | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!open) return null;

  const handlePlayerTap = (candidate: PomCandidate) => {
    // Allow re-selection — voting is editable until the 24h window closes.
    setSelectedCandidate(candidate);
    setShowConfirm(true);
  };

  const handleConfirmVote = () => {
    if (selectedCandidate) {
      onVote(selectedCandidate.id);
      setShowConfirm(false);
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-[70] max-h-[85vh] overflow-y-auto animate-slide-up">
        {/* Pull handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pb-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-brand-green" strokeWidth={2} />
              </div>
              <h2 className="text-lg font-bold text-brand-black">{t('selectPlayer')}</h2>
            </div>
          </div>

          {/* Already voted indicator */}
          {hasVoted && (
            <div className="mb-4 bg-brand-green/5 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-brand-green flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
              </div>
              <span className="text-sm font-medium text-brand-green">
                {t('voted')}{' '}
                {votedFor
                  ? candidates.find((c) => c.id === votedFor)?.fullName ?? ''
                  : ''}
              </span>
            </div>
          )}

          {/* Empty state */}
          {candidates.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">{t('notAttended')}</p>
          )}

          {/* Candidate list */}
          <div className="space-y-2">
            {candidates.map((candidate) => {
              const isSelected = votedFor === candidate.id;
              return (
                <button
                  key={candidate.id}
                  onClick={() => handlePlayerTap(candidate)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-brand-green/10 border border-brand-green/30'
                      : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  {/* Avatar */}
                  {candidate.avatarUrl ? (
                    <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={candidate.avatarUrl}
                        alt={candidate.fullName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-brand-green/20' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`text-sm font-bold ${
                          isSelected ? 'text-brand-green' : 'text-gray-500'
                        }`}
                      >
                        {candidate.fullName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Name */}
                  <span
                    className={`flex-1 text-start text-sm font-medium ${
                      isSelected ? 'text-brand-green' : 'text-brand-black'
                    }`}
                  >
                    {candidate.fullName}
                  </span>

                  {/* Checkmark for current selection */}
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-brand-green flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      <PomConfirmModal
        open={showConfirm}
        candidate={selectedCandidate}
        onConfirm={handleConfirmVote}
        onCancel={() => setShowConfirm(false)}
        isPending={isPending}
      />
    </>
  );
}
