'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Shield, Check } from 'lucide-react';
import type { PomCandidate } from '@/hooks/usePom';
import type { RosterPlayer } from '@/types';
import TeamLineup from './TeamLineup';
import PomConfirmModal from './PomConfirmModal';

interface PomVotingSheetProps {
  open: boolean;
  onClose: () => void;
  format: string;
  candidates: PomCandidate[];
  hasVoted: boolean;
  votedFor: string | null;
  isPending: boolean;
  onVote: (candidateId: string) => void;
}

export default function PomVotingSheet({
  open,
  onClose,
  format,
  candidates,
  hasVoted,
  votedFor,
  isPending,
  onVote,
}: PomVotingSheetProps) {
  const t = useTranslations('pom');
  const [selectedCandidate, setSelectedCandidate] = useState<PomCandidate | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Map the confirmed candidates into the shared team-lineup shape so the
  // picker is the single source of truth (Home/Away roster), not a flat list.
  const roster = useMemo<RosterPlayer[]>(
    () =>
      candidates.map((c) => ({
        id: c.id,
        userId: c.id,
        name: c.fullName,
        avatarUrl: c.avatarUrl ?? '',
        team: c.team,
        isHost: c.isHost,
      })),
    [candidates],
  );

  if (!open) return null;

  const handlePlayerTap = (player: RosterPlayer) => {
    const candidate = candidates.find((c) => c.id === player.userId) ?? null;
    if (candidate) {
      setSelectedCandidate(candidate);
      setShowConfirm(true);
    }
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
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-brand-green" strokeWidth={2} />
            </div>
            <h2 className="text-lg font-bold text-brand-black">{t('selectPlayer')}</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">{t('voteSubtitle')}</p>

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

          {/* Team lineup picker — the confirmed roster is the source of truth */}
          {candidates.length > 0 && (
            <TeamLineup
              format={format}
              roster={roster}
              onPlayerClick={handlePlayerTap}
              hideEmpty
            />
          )}
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
