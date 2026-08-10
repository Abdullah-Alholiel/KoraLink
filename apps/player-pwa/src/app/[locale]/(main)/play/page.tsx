'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, Search, Plus, Trophy, AlertTriangle } from 'lucide-react';
import DatePicker from '@/components/matches/DatePicker';
import MatchCard from '@/components/matches/MatchCard';
import { useMatches } from '@/hooks/useMatches';
import { selectUser, useAppStore } from '@/store/useAppStore';

export default function PlayPage() {
    const pathname = usePathname();
    const t = useTranslations();
    const locale = pathname.split('/')[1] || 'en';
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // ── Data fetching via React Query ──
    const {
        data,
        isLoading,
        error,
        refetch,
    } = useMatches({
        date: selectedDate,
    });

    const matches = data?.matches ?? [];
    const storeUser = useAppStore(selectUser);
    const currentUserId = storeUser?.id;

    // ── Client-side search filter ──
    const filteredMatches = searchQuery
        ? matches.filter((m) => {
              const q = searchQuery.toLowerCase();
              return (
                  m.title.toLowerCase().includes(q) ||
                  m.venueName.toLowerCase().includes(q) ||
                  m.location.toLowerCase().includes(q) ||
                  m.organizer.name.toLowerCase().includes(q)
              );
          })
        : matches;

    return (
        <div className="pb-4">
            {/* ── Top App Bar (inline) ─────────────── */}
            <div className="bg-white">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center">
                            <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2.5} />
                        </div>
                        <span className="text-lg font-bold text-brand-black tracking-tight">
                            {t('app.title')}
                        </span>
                    </div>
                    <button
                        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50"
                        aria-label={t('nav.notifications')}
                    >
                        <Bell className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                    </button>
                </div>

                {/* Search bar + Host button */}
                <div className="flex items-center gap-3 px-4 pb-3">
                    <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green transition-colors">
                        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('play.searchPlaceholder')}
                            className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
                        />
                    </div>
                    <Link
                        href={`/${locale}/host`}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-brand-green text-white active:scale-95 transition-transform shadow-[0_4px_20px_rgba(37,65,50,0.4)]"
                        aria-label={t('host.title')}
                    >
                        <Plus className="w-5 h-5" strokeWidth={2.5} />
                    </Link>
                </div>
            </div>

            {/* ── Date Picker ─────────────────────── */}
            <DatePicker
                onDateSelect={(date) => setSelectedDate(date.toISOString().split('T')[0])}
            />

            {/* ── Content: 5 UX States ────────────── */}

            {/* 1. Loading State */}
            {isLoading && (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="bg-white rounded-2xl shadow-card mx-4 mb-3 p-4 animate-pulse"
                        >
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                </div>
                            </div>
                            <div className="flex justify-between items-end mt-4">
                                <div className="h-6 bg-gray-200 rounded w-20" />
                                <div className="h-9 bg-gray-200 rounded-full w-24" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 2. Error State */}
            {error && !isLoading && (
                <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-8 h-8 text-brand-red" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-bold text-brand-black mb-1">
                        {t('common.error')}
                    </h3>
                    <p className="text-sm text-gray-400 text-center mb-6">
                        {t('common.errorDescription')}
                    </p>
                    <button
                        onClick={() => refetch()}
                        className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform"
                    >
                        {t('common.retry')}
                    </button>
                </div>
            )}

            {/* 3. Empty State (only when API returns empty array or search has no results) */}
            {!isLoading && !error && data && filteredMatches.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <Trophy className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-bold text-brand-black mb-1">
                        {t('play.noMatches')}
                    </h3>
                    <p className="text-sm text-gray-400 text-center mb-6">
                        {t('play.noMatchesDescription')}
                    </p>
                    <Link
                        href={`/${locale}/host`}
                        className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform"
                    >
                        {t('play.hostMatch')}
                    </Link>
                </div>
            )}

            {/* 4. Populated State — match list */}
            {!isLoading && !error && filteredMatches.length > 0 && (
                <>
                    {/* Section label */}
                    <div className="px-4 pt-1 pb-2">
                        <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest">
                            {t('play.discoveringMore')}
                        </p>
                    </div>

                    {/* Match cards */}
                    <div className="animate-fade-in-up">
                        {filteredMatches.map((match) => (
                            <MatchCard key={match.id} match={match} currentUserId={currentUserId} />
                        ))}
                    </div>
                </>
            )}

            {/* 5. Edge Case — offline/connection error indicator */}
            {error && !isLoading && !data && (
                <div className="mx-4 mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-amber-700 font-medium">
                        {t('common.offlineBanner')}
                    </p>
                </div>
            )}
        </div>
    );
}
