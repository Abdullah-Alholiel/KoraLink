'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trophy, Crown, Check, Loader2, Clock, ChevronRight } from 'lucide-react';
import { usePomResult, useVote } from '@/hooks/usePom';
import PomVotingSheet from './PomVotingSheet';

interface PostMatchSectionProps {
  matchId: string;
  currentUserId?: string;
}

export default function PostMatchSection({ matchId, currentUserId }: PostMatchSectionProps) {
  const t = useTranslations('pom');
  const { data: pom, isLoading } = usePomResult(matchId, currentUserId);
  const voteMutation = useVote(matchId);
  const [showVoting, setShowVoting] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-5 mt-4 flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 text-gray-300 animate-spin" strokeWidth={2} />
      </div>
    );
  }

  if (!pom || pom.status === 'not_completed') {
    return null;
  }

  // ── Voting closed — no winner (tie or no votes) ──
  if (pom.status === 'no_winner') {
    return (
      <div className="mx-5 mt-4 bg-gray-50 rounded-2xl p-5 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-6 h-6 text-gray-300" strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-bold text-brand-black">{t('noWinner')}</h3>
        <p className="text-xs text-gray-400 mt-1">{t('noWinnerDescription')}</p>
      </div>
    );
  }

  // ── Voting closed — winner declared ──
  if (pom.status === 'completed') {
    return (
      <div className="mx-5 mt-4 bg-gradient-to-b from-brand-green/5 to-white rounded-2xl p-5 border border-brand-green/10">
        <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-full bg-brand-green/10 flex items-center justify-center">
                <Crown className="w-4 h-4 text-brand-green" strokeWidth={2} />
            </div>
            <span className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
                {t('title')}
            </span>
        </div>
        <div className="flex items-center gap-3">
            {pom.winner.avatarUrl ? (
                <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pom.winner.avatarUrl} alt={pom.winner.fullName} className="w-full h-full object-cover" />
                </div>
            ) : (
                <div className="w-14 h-14 rounded-full bg-brand-green/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-brand-green">
                        {pom.winner.fullName.charAt(0).toUpperCase()}
                    </span>
                </div>
            )}
            <div className="flex-1">
                <h3 className="text-base font-bold text-brand-black">{pom.winner.fullName}</h3>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Trophy className="w-3 h-3 text-brand-green" strokeWidth={2} />
                    <span dir="ltr">{pom.voteCount}</span> {t('votes')}
                </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                <Crown className="w-5 h-5 text-brand-green" strokeWidth={2} />
            </div>
        </div>
      </div>
    );
  }

  // ── Voting still open ──
  return (
    <>
      <div className="mx-5 mt-4 bg-white rounded-2xl shadow-card p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-brand-green/10 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2} />
            </div>
            <span className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
              {t('votePrompt')}
            </span>
          </div>
          <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={1.5} />
            {t('votingOpen')}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-4">{t('voteSubtitle')}</p>

        {/* Already voted indicator */}
        {pom.hasVoted ? (
          <div className="bg-brand-green/5 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-brand-green flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </div>
            <span className="text-sm font-medium text-brand-green">{t('voted')}</span>
          </div>
        ) : (
          /* Vote trigger button */
          <button
            onClick={() => setShowVoting(true)}
            className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3.5
              hover:bg-brand-green/5 active:scale-[0.98] transition-all group"
          >
            <span className="text-sm font-semibold text-brand-black">{t('votePrompt')}</span>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-brand-green transition-colors" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Voting bottom sheet */}
      <PomVotingSheet
        open={showVoting}
        onClose={() => setShowVoting(false)}
        candidates={pom.candidates}
        hasVoted={pom.hasVoted}
        votedFor={pom.votedFor}
        isPending={voteMutation.isPending}
        onVote={(candidateId) => voteMutation.mutate(candidateId)}
      />
    </>
  );
}
