'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, AlertTriangle, Play } from 'lucide-react';
import MatchCard from '@/components/matches/MatchCard';
import NotificationBell from '@/components/layout/NotificationBell';
import { useMyMatches } from '@/hooks/useUser';
import { adaptMatchList, isPotmVotingOpen } from '@/lib/api-adapter';
import { selectUser, useAppStore } from '@/store/useAppStore';

/** True while POTM voting is still open — uses the authoritative API deadline
 *  when present, falling back to the coarse scheduled-end estimate otherwise. */
const isVotingOpen = (m: { scheduledAt?: string; votingClosesAt?: string }) =>
  m.votingClosesAt
    ? Date.now() < new Date(m.votingClosesAt).getTime()
    : isPotmVotingOpen(m.scheduledAt);

export default function MyGamesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/')[1] || 'en';
  const t = useTranslations();

  const { data: matchesApi, isLoading, error, refetch } = useMyMatches();
  const storeUser = useAppStore(selectUser);
  const matches = matchesApi ? adaptMatchList(matchesApi, storeUser?.id) : [];

  const activeMatches = matches.filter((m) =>
    // Active = joinable OR played within the POTM voting window (24h after
    // the final whistle) so players can still vote after midnight.
    ['open', 'full', 'in_progress'].includes(m.status) ||
    (m.status === 'completed' && (m.isJoined || m.isUserHost) && isVotingOpen(m))
  );
  const historyMatches = matches.filter((m) =>
    ['completed', 'cancelled'].includes(m.status) &&
    !(m.status === 'completed' && (m.isJoined || m.isUserHost) && isVotingOpen(m))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center px-4 pt-[var(--top-safe-inset)] pb-3 flex-shrink-0 bg-white relative z-10">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50"
        >
          <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
        </button>
        <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
          {t('myGames.title')}
        </h1>
        {/* P2-34 (run #22): bell reachable from every tab */}
        <NotificationBell />
      </div>

      <div className="flex-1 overflow-y-auto scroll-container bg-brand-bg">
        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-green animate-spin" strokeWidth={2} />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex flex-col items-center py-20 px-8">
            <AlertTriangle className="w-10 h-10 text-brand-red" strokeWidth={1.5} />
            <p className="text-sm text-gray-400 mt-3">{t('common.error')}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 bg-brand-green text-white px-6 py-2.5 rounded-full text-sm font-bold active:scale-95 transition-transform"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* Populated */}
        {!isLoading && !error && (
          <>
            {/* Active Matches */}
            <div className="pt-4">
              <h2 className="text-xs font-bold text-brand-green uppercase tracking-widest px-5 mb-3">
                {t('myGames.active')}
              </h2>
              {activeMatches.length === 0 ? (
                <div className="flex flex-col items-center py-10 px-8">
                  <div className="w-14 h-14 rounded-full bg-brand-green/10 flex items-center justify-center mb-3">
                    <Play className="w-6 h-6 text-brand-green" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-brand-black">
                    {t('myGames.emptyActive')}
                  </p>
                  <Link
                    href={`/${locale}/play`}
                    className="mt-3 bg-brand-green text-white px-6 py-2.5 rounded-full text-sm font-bold"
                  >
                    {t('myGames.emptyCta')}
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4">
                  {activeMatches.map((match) => (
                    <MatchCard key={match.id} match={match} currentUserId={storeUser?.id} />
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            {activeMatches.length > 0 && historyMatches.length > 0 && (
              <div className="h-px bg-gray-100 mx-5 my-4" />
            )}

            {/* History */}
            {historyMatches.length > 0 && (
              <div className="pb-32">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-5 mb-3">
                  {t('myGames.history')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4">
                  {historyMatches.map((match) => (
                    <MatchCard key={match.id} match={match} currentUserId={storeUser?.id} />
                  ))}
                </div>
              </div>
            )}

            {/* Fully Empty */}
            {activeMatches.length === 0 && historyMatches.length === 0 && (
              <div className="flex flex-col items-center py-20 px-8">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <Play className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-brand-black">
                  {t('myGames.empty')}
                </p>
                <Link
                  href={`/${locale}/play`}
                  className="mt-3 bg-brand-green text-white px-6 py-2.5 rounded-full text-sm font-bold"
                >
                  {t('myGames.emptyCta')}
                </Link>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
