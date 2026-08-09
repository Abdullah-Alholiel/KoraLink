'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, MapPin, Star, ChevronRight } from 'lucide-react';
import { useVenues } from '@/hooks/useVenues';

const FILTER_KEYS = ['Nearby', 'Top Rated', 'Indoor', 'Available Now'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABEL_MAP: Record<FilterKey, string> = {
    Nearby: 'clubs.filters.nearby',
    'Top Rated': 'clubs.filters.topRated',
    Indoor: 'clubs.filters.indoor',
    'Available Now': 'clubs.filters.availableNow',
};

export default function ClubsPage() {
    const t = useTranslations();
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';
    const [activeFilter, setActiveFilter] = useState<FilterKey>('Nearby');
    const [searchQuery, setSearchQuery] = useState('');

    // ── Data fetching via React Query ──
    const {
        data: venues,
        isLoading,
        error,
        refetch,
    } = useVenues();

    // Client-side search + filter over API data
    const filteredVenues = (venues ?? []).filter((v) => {
        const matchesQuery =
            !searchQuery ||
            v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.city.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesQuery) return false;

        if (activeFilter === 'Top Rated') return v.rating >= 4.7;
        if (activeFilter === 'Indoor') {
            const amenities = Array.isArray(v.amenities) ? (v.amenities as string[]) : [];
            return amenities.includes('indoors') || amenities.includes('indoor');
        }
        return true; // Nearby, Available Now → all
    });

    return (
        <div className="pb-4">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h1 className="text-2xl font-bold text-brand-black">{t('clubs.title')}</h1>
                <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50">
                    <MapPin className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                </button>
            </div>

            {/* ── Search ────────────────────────────── */}
            <div className="px-4 pb-3">
                <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green transition-colors">
                    <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('clubs.searchPlaceholder')}
                        className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
                    />
                </div>
            </div>

            {/* ── Filter Pills ──────────────────────── */}
            <div className="flex gap-2 px-4 pb-4 overflow-x-auto scroll-container">
                {FILTER_KEYS.map((filter) => (
                    <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`
              px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-95
              ${activeFilter === filter
                                ? 'bg-brand-black text-white'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }
            `}
                    >
                        {t(FILTER_LABEL_MAP[filter])}
                    </button>
                ))}
            </div>

            {/* ── Content: 5 UX States ──────────────── */}

            {/* 1. Loading */}
            {isLoading && (
                <div className="space-y-3 px-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white rounded-2xl shadow-card p-4 animate-pulse">
                            <div className="flex items-start justify-between">
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-gray-200 flex-shrink-0" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 2. Error */}
            {error && !isLoading && (
                <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-4">
                        <span className="text-brand-red text-2xl">!</span>
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

            {/* 3. Empty (API returned no venues, or search yields nothing) */}
            {!isLoading && !error && filteredVenues.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <MapPin className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-bold text-brand-black mb-1">
                        {venues && venues.length > 0
                            ? t('common.noResults')
                            : t('clubs.noClubs')}
                    </h3>
                    <p className="text-sm text-gray-400 text-center mb-6">
                        {t('clubs.noClubsDescription')}
                    </p>
                </div>
            )}

            {/* 4. Populated — venue cards */}
            {!isLoading && !error && filteredVenues.length > 0 && (
                <div className="space-y-3 px-4">
                    {filteredVenues.map((venue) => (
                        <div key={venue.id} className="bg-white rounded-2xl shadow-card p-4 animate-fade-in-up">
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-bold text-brand-black">{venue.name}</h3>
                                    <div className="flex items-center gap-1 mt-1">
                                        <MapPin className="w-3 h-3 text-gray-400" strokeWidth={1.5} />
                                        <span className="text-xs text-gray-500">
                                            {venue.city} • {venue.address}
                                            {venue.distance_m != null && (
                                                <span className="text-gray-400">
                                                    {' '}• {(venue.distance_m / 1000).toFixed(1)}km
                                                </span>
                                            )}
                                        </span>
                                    </div>

                                    {/* Rating + pitch count */}
                                    <div className="flex items-center gap-2 mt-2.5">
                                        <div className="flex items-center gap-0.5">
                                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                            <span className="text-xs font-semibold text-amber-600">
                                                {venue.rating.toFixed(1)}
                                            </span>
                                        </div>
                                        <span className="text-gray-300">|</span>
                                        <span className="text-xs text-gray-400">
                                            {venue.pitch_count} {t('clubs.pitches')}
                                        </span>
                                    </div>
                                </div>

                                {/* Avatar + Book */}
                                <div className="flex flex-col items-end gap-2 ms-3">
                                    <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-bold text-gray-500">
                                            {venue.name.charAt(0)}
                                        </span>
                                    </div>
                                    <Link href={`/${locale}/clubs/${venue.id}`} className="flex items-center gap-0.5 text-sm font-medium text-brand-black active:scale-95 transition-transform">
                                        {t('common.seeAll')}
                                        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 5. Edge — offline indicator when API errored */}
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
