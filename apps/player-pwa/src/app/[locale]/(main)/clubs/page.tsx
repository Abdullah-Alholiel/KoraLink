'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, MapPin, Users } from 'lucide-react';
import { useVenues } from '@/hooks/useVenues';
import { useLocation } from '@/providers/LocationProvider';
import { formatDistance } from '@/lib/format';
import { isVenueOpenNow } from '@/lib/venue-hours';

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
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const [activeFilter, setActiveFilter] = useState<FilterKey>('Nearby');
    const [searchQuery, setSearchQuery] = useState('');
    const { coords } = useLocation();

    const {
        data: venues,
        isLoading,
        error,
        refetch,
    } = useVenues(coords ? { lat: coords.lat, lng: coords.lng } : undefined);

    const filteredVenues = (venues ?? []).filter((v) => {
        const matchesQuery =
            !searchQuery ||
            v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.city.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesQuery) return false;

        if (activeFilter === 'Top Rated') return true; // rating removed — show all
        if (activeFilter === 'Indoor') {
            const amenities = Array.isArray(v.amenities) ? (v.amenities as string[]) : [];
            return amenities.includes('indoors') || amenities.includes('indoor');
        }
        // P2-13 (run #17): real open-now logic backed by venue hours (P1-25).
        if (activeFilter === 'Available Now') return isVenueOpenNow(v);
        return true;
    });

    return (
        <div className="pb-4">
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 pt-[var(--top-safe-inset)] pb-3">
                <div>
                    <h1 className="text-2xl font-bold text-brand-black">{t('clubs.title')}</h1>
                    {filteredVenues.length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                            {filteredVenues.length} {t('clubs.venues')}
                        </p>
                    )}
                </div>
                {/* P2-13 (run #17): decorative MapPin button removed — it had no
                    onClick/href (dead UI); the page already uses device coords
                    automatically when location permission is granted. */}
            </div>

            {/* ── Search ── */}
            <div className="px-5 pb-3">
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

            {/* ── Filter Pills ── */}
            <div className="flex gap-2 px-5 pb-4 overflow-x-auto scroll-container">
                {FILTER_KEYS.map((filter) => (
                    <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-95 ${
                            activeFilter === filter
                                ? 'bg-brand-black text-white'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {t(FILTER_LABEL_MAP[filter])}
                    </button>
                ))}
            </div>

            {/* ── Loading ── */}
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-5">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-white rounded-2xl shadow-card p-4 animate-pulse">
                            <div className="flex items-start justify-between">
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                                </div>
                                <div className="w-14 h-14 rounded-2xl bg-gray-200 flex-shrink-0" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Error ── */}
            {error && !isLoading && (
                <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-4">
                        <span className="text-brand-red text-2xl">!</span>
                    </div>
                    <h3 className="text-lg font-bold text-brand-black mb-1">{t('common.error')}</h3>
                    <p className="text-sm text-gray-400 text-center mb-6">{t('common.errorDescription')}</p>
                    <button
                        onClick={() => refetch()}
                        className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform"
                    >
                        {t('common.retry')}
                    </button>
                </div>
            )}

            {/* ── Empty ── */}
            {!isLoading && !error && filteredVenues.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 px-8">
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <MapPin className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-bold text-brand-black mb-1">
                        {venues && venues.length > 0 ? t('common.noResults') : t('clubs.noClubs')}
                    </h3>
                    <p className="text-sm text-gray-400 text-center mb-6">{t('clubs.noClubsDescription')}</p>
                </div>
            )}

            {/* ── Populated ── */}
            {!isLoading && !error && filteredVenues.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-5">
                    {filteredVenues.map((venue) => (
                        <Link
                            key={venue.id}
                            href={`/${locale}/clubs/${venue.id}`}
                            className="block bg-white rounded-2xl shadow-card p-4 animate-fade-in-up transition-shadow hover:shadow-card-hover active:scale-[0.99]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                {/* Venue avatar */}
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-green/20 to-brand-green/5 flex items-center justify-center flex-shrink-0">
                                    <span className="text-lg font-bold text-brand-green">
                                        {venue.name.charAt(0).toUpperCase()}
                                    </span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-base font-bold text-brand-black truncate">{venue.name}</h3>
                                        {venue.distance_m != null && (
                                            <span className="text-[11px] font-medium text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full flex-shrink-0 ms-2">
                                                {formatDistance(venue.distance_m, locale === 'ar' ? 'ar' : 'en')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1 mt-0.5">
                                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                                        <span className="text-xs text-gray-500 truncate">
                                            {venue.city}{venue.address ? ` · ${venue.address}` : ''}
                                        </span>
                                    </div>

                                    {/* Pitch count + P1-25 open/closed badge */}
                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="flex items-center gap-0.5">
                                            <Users className="w-3.5 h-3.5 text-brand-green" />
                                            <span className="text-xs font-semibold text-brand-green">
                                                {venue.pitch_count} {t('clubs.pitches')}
                                            </span>
                                        </div>
                                        {(() => {
                                            const openNow = isVenueOpenNow(venue);
                                            return (
                                                <span
                                                    role="status"
                                                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                                        openNow
                                                            ? 'text-green-700 bg-green-100'
                                                            : 'text-gray-500 bg-gray-100'
                                                    }`}
                                                >
                                                    {openNow ? t('clubs.openNow') : t('clubs.closed')}
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    {/* Amenities badges */}
                                    {(() => {
                                        const amenities = Array.isArray(venue.amenities)
                                            ? (venue.amenities as string[])
                                            : [];
                                        if (amenities.length === 0) return null;
                                        const AMENITY_ICONS: Record<string, string> = {
                                            parking: '🅿️',
                                            changing_rooms: '👕',
                                            floodlights: '💡',
                                            cafe: '☕',
                                            water_cooler: '💧',
                                            gym: '🏋️',
                                        };
                                        const shown = amenities.slice(0, 3);
                                        const overflow = amenities.length - 3;
                                        return (
                                            <div className="flex items-center gap-1 mt-2 flex-wrap">
                                                {shown.map((code) => (
                                                    <span
                                                        key={code}
                                                        className="text-[9px] px-1.5 py-px rounded-full bg-gray-100 text-gray-500 font-medium"
                                                    >
                                                        {AMENITY_ICONS[code] || code}
                                                    </span>
                                                ))}
                                                {overflow > 0 && (
                                                    <span className="text-[9px] text-gray-400 font-medium">+{overflow}</span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
