'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Trophy, Crown, Check, Loader2, Clock, ChevronRight, Pencil } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { env } from '@/env.mjs';
import { useAppStore } from '@/store/useAppStore';
import { usePomResult, useVote } from '@/hooks/usePom';
import { trackEvent, addBreadcrumb } from '@/providers/ObservabilityProvider';
import PomVotingSheet from './PomVotingSheet';
import PomResultsSheet from './PomResultsSheet';

interface PostMatchSectionProps {
  matchId: string;
  currentUserId?: string;
  format?: string;
}

export default function PostMatchSection({ matchId, currentUserId, format = '7v7' }: PostMatchSectionProps) {
  const t = useTranslations('pom');
  const queryClient = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const { data: pom, isLoading } = usePomResult(matchId, currentUserId);
  const voteMutation = useVote(matchId);
  const [showVoting, setShowVoting] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Analytics: track which POTM status the user sees
  const pomStatus = pom?.status;
  useEffect(() => {
    if (pomStatus) {
      trackEvent('potm_status_viewed', {
        match_id: matchId,
        status: pomStatus,
      });
    }
  }, [pomStatus, matchId]);

  // Real-time: listen for the POTM winner being decided while viewing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('koralink_token');
    const socket: Socket = io(`${env.NEXT_PUBLIC_API_URL ?? ''}/lobby`, {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });
    socket.on('connect', () => socket.emit('join-lobby', { matchId }));
    socket.on('pom-decided', (payload: { winner: { fullName: string } }) => {
      addBreadcrumb('POTM decided via WebSocket', 'potm', 'info', { matchId });
      trackEvent('potm_decided_received', { match_id: matchId });
      queryClient.invalidateQueries({ queryKey: ['pom', matchId] });
      showToast(`🏆 ${payload.winner.fullName} — ${t('pomDecided')}`, 'success');
    });
    return () => {
      socket.disconnect();
    };
  }, [matchId, queryClient, showToast, t]);

  if (isLoading) {
    return (
      <div className="mx-5 mt-4 flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 text-gray-300 animate-spin" strokeWidth={2} />
      </div>
    );
  }

  // ── Active match — placeholder (card is always present at top, all states) ──
  if (!pom || pom.status === 'not_completed') {
    return (
      <div className="mx-5 mt-4 bg-white/60 rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {t('title')}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{t('willBeDecided')}</p>
        </div>
      </div>
    );
  }

  // ── Voting closed — no votes cast ──
  if (pom.status === 'no_votes') {
    return (
      <div className="mx-5 mt-4 bg-white rounded-2xl shadow-card p-5 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {t('title')}
          </p>
          <p className="text-sm font-semibold text-brand-black mt-1">{t('noVotes')}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('noVotesDescription')}</p>
        </div>
      </div>
    );
  }

  // ── Voting closed — tied votes (no winner) ──
  if (pom.status === 'no_winner') {
    return (
      <div className="mx-5 mt-4 bg-white rounded-2xl shadow-card p-5 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {t('title')}
          </p>
          <p className="text-sm font-semibold text-brand-black mt-1">{t('noWinner')}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('noWinnerDescription')}</p>
        </div>
      </div>
    );
  }

  // ── Voting closed — winner declared (clickable → runner-up results) ──
  if (pom.status === 'completed') {
    return (
      <>
        <div className="mx-5 mt-4">
          <button
            onClick={() => { setShowResults(true); trackEvent('potm_results_opened', { match_id: matchId }); }}
            className="w-full text-start bg-gradient-to-b from-brand-green/5 to-white rounded-2xl p-5 border border-brand-green/10 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-brand-green/10 flex items-center justify-center">
                <Crown className="w-4 h-4 text-brand-green" strokeWidth={2} />
              </div>
              <span className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
                {t('title')}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 ms-auto" strokeWidth={2} />
            </div>
            <div className="flex items-center gap-3">
              {pom.winner.avatarUrl ? (
                <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pom.winner.avatarUrl}
                    alt={pom.winner.fullName}
                    className="w-full h-full object-cover"
                  />
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
            <p className="text-[10px] font-medium text-brand-green mt-3">{t('viewResults')}</p>
          </button>
        </div>

        <PomResultsSheet
          open={showResults}
          onClose={() => setShowResults(false)}
          winner={pom.winner}
          results={pom.results}
        />
      </>
    );
  }

  // ── Voting still open ──
  const waiting = Math.max(pom.totalEligibleVoters - pom.votedCount, 0);
  return (
    <>
      <div className="mx-5 mt-4 bg-white rounded-2xl shadow-card p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
              <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2} />
            </div>
            <span className="text-[10px] font-bold text-brand-green uppercase tracking-widest truncate">
              {t('title')}
            </span>
          </div>
          <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" strokeWidth={1.5} />
            {t('votingOpen')}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-4">{t('voteSubtitle')}</p>

        {/* Submitted / waiting for others state */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-green rounded-full transition-all"
              style={{
                width: `${pom.totalEligibleVoters > 0 ? (pom.votedCount / pom.totalEligibleVoters) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-[10px] font-semibold text-gray-500 flex-shrink-0 whitespace-nowrap">
            {t('votersSubmitted', {
              voted: pom.votedCount,
              total: pom.totalEligibleVoters,
            })}
          </span>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">
          {waiting > 0
            ? t('awaitingVotes', { count: waiting })
            : t('allVoted')}
        </p>

        {/* Voted / change-vote or vote button */}
        {pom.hasVoted ? (
          <div className="space-y-2">
            <div className="bg-brand-green/5 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-brand-green flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
              </div>
              <span className="text-sm font-medium text-brand-green">
                {t('voted')}{' '}
                {pom.votedFor
                  ? pom.candidates.find((c) => c.id === pom.votedFor)?.fullName ?? ''
                  : ''}
              </span>
            </div>
            <button
              onClick={() => { setShowVoting(true); trackEvent('potm_change_vote_clicked', { match_id: matchId }); }}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3
                border border-brand-green/20 text-sm font-semibold text-brand-green
                hover:bg-brand-green/5 active:scale-[0.98] transition-all"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
              {t('changeVote')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowVoting(true); trackEvent('potm_vote_opened', { match_id: matchId }); }}
            className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3.5
              hover:bg-brand-green/5 active:scale-[0.98] transition-all group"
          >
            <span className="text-sm font-semibold text-brand-black">{t('votePrompt')}</span>
            <ChevronRight
              className="w-4 h-4 text-gray-400 group-hover:text-brand-green transition-colors"
              strokeWidth={2}
            />
          </button>
        )}
      </div>

      {/* Voting bottom sheet */}
      <PomVotingSheet
        open={showVoting}
        onClose={() => setShowVoting(false)}
        format={format}
        candidates={pom.candidates}
        hasVoted={pom.hasVoted}
        votedFor={pom.votedFor}
        isPending={voteMutation.isPending}
        onVote={(candidateId) => voteMutation.mutate(candidateId)}
      />
    </>
  );
}
