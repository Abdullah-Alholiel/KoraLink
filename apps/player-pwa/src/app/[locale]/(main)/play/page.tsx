'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Plus, Trophy, AlertTriangle } from 'lucide-react';
import DatePicker from '@/components/matches/DatePicker';
import NotificationBell from '@/components/layout/NotificationBell';
import MatchDateSections from '@/components/matches/MatchDateSections';
import FilterBar, { type PlayFilters } from '@/components/matches/FilterBar';
import { useMatches } from '@/hooks/useMatches';
import { useLocation } from '@/providers/LocationProvider';
import { dateInRiyadh } from '@/lib/api-adapter';
import { selectUser, useAppStore } from '@/store/useAppStore';

export default function PlayPage() {
    const pathname = usePathname();
    const t = useTranslations();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState<PlayFilters>({
        format: null,
        gender: null,
        maxPrice: null,
        time: null,
    });
    const { coords } = useLocation();

    // ── Data fetching via React Query ──
    const {
        matches,
        isLoading,
        error,
        refetch,
        hasMore,
        fetchNextPage,
        isFetchingNextPage,
    } = useMatches({
        date: selectedDate,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        format: filters.format,
        gender: filters.gender,
        maxPrice: filters.maxPrice,
        time: filters.time,
    });

    const storeUser = useAppStore(selectUser);
    const currentUserId = storeUser?.id;

    /* ── Pinned header group (Abdullah, 2026-09-03): search+pill, calendar and
       filter bar stick under the app bar while scrolling the games list.
       Sentinel sits BELOW the FilterBar; when it scrolls out of view the group
       pins. border-b + shadow appear only when pinned (no floating seam). ── */
    const [isPinned, setIsPinned] = useState(false);
    const stickySentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = stickySentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => setIsPinned(!entry.isIntersecting),
            { rootMargin: '-46px 0px 0px 0px' } // app bar height ≈ 46px
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const stickyGroupClass = isPinned
        ? 'sticky top-[46px] z-40 bg-white border-b border-gray-100 shadow-[0_4px_14px_rgba(0,0,0,0.07)]'
        : 'bg-white';

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
                <div className="flex items-center justify-between px-4 pt-[var(--top-safe-inset)] pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center">
                            <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2.5} />
                        </div>
                        <span className="text-lg font-bold text-brand-black tracking-tight">
                            {t('app.title')}
                        </span>
                    </div>
                    {/* P2-34 (run #22): bell reachable from every tab */}
                    <NotificationBell />
                </div>
            </div>

            {/* ── Pinned group: search + Host pill + calendar + filters.
                Sticks under the app bar while the games list scrolls. ── */}
            <div className={stickyGroupClass}>
                {/* Search bar + labeled Host pill (Abdullah, 2026-09-03:
                    "+ Host a Match" text next to search for easy visual) */}
                <div className="flex items-center gap-2 px-4 pb-2.5 pt-1">
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
                        className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-brand-green bg-white ps-1.5 pe-3.5 active:scale-95 transition-transform"
                        aria-label={t('host.title')}
                        data-testid="host-plus-button"
                    >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-green text-white">
                            <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
                        </span>
                        <span className="text-[12.5px] font-bold text-brand-green">
                            {t('play.hostMatch')}
                        </span>
                    </Link>
                </div>

                {/* ── Date Picker (all games by default; tap to filter, tap again to clear) ── */}
                <DatePicker
                    fireOnMount={false}
                    selectedDate={selectedDate ? new Date(selectedDate) : null}
                    onDateSelect={(date) => {
                        const iso = dateInRiyadh(date);
                        setSelectedDate((prev) => (prev === iso ? null : iso));
                    }}
                />

                {/* ── Filter Bar ──────────────────────── */}
                <FilterBar filters={filters} onChange={setFilters} />
            </div>

            {/* Sticky sentinel: when this scrolls past the app bar, the group
                above pins (IntersectionObserver flips isPinned). */}
            <div ref={stickySentinelRef} aria-hidden="true" className="h-px" />

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
            {!isLoading && !error && filteredMatches.length === 0 && (
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

            {/* 4. Populated State — matches grouped by date, nearest-first within a day */}
            {!isLoading && !error && filteredMatches.length > 0 && (
                <MatchDateSections
                    matches={filteredMatches}
                    currentUserId={currentUserId}
                    locale={locale === 'ar' ? 'ar' : 'en'}
                />
            )}

            {/* 6. Load More — server-side pagination (P1-19); hidden when the
                last page is reached. */}
            {!isLoading && !error && filteredMatches.length > 0 && hasMore && (
                <div className="flex justify-center py-6">
                    <button
                        onClick={fetchNextPage}
                        disabled={isFetchingNextPage}
                        className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
                    >
                        {isFetchingNextPage ? t('common.loading') : t('play.loadMore')}
                    </button>
                </div>
            )}

            {/* 5. Edge Case — offline/connection error indicator */}
            {error && !isLoading && (
                <div className="mx-4 mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-amber-700 font-medium">
                        {t('common.offlineBanner')}
                    </p>
                </div>
            )}
        </div>
    );
}
