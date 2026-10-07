'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { classifyError, errorKey } from '@/lib/error-classify';
import { Search, MapPin, Users, X, Heart, Loader2 } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import OfflineBanner from '@/components/layout/OfflineBanner';
import SuggestionChips from '@/components/search/SuggestionChips';
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions';
import { filterSuggestions } from '@/lib/search-suggestions';
import { useVenues } from '@/hooks/useVenues';
import {
    useVenueFavoriteIds,
    useVenueFavoriteToggle,
} from '@/hooks/useVenueFavorites';
import { useLocation } from '@/providers/LocationProvider';
import { formatDistance } from '@/lib/format';
import { isVenueOpenNow } from '@/lib/venue-hours';
import { useAppStore } from '@/store/useAppStore';

// Run #68 (P2-13 residual): the dead "Top Rated" pill is REMOVED — the product
// has no ratings pipeline (venues.rating is all-zero, no write path), so the
// pill filtered nothing. Nearby is now a real distance sort (see below).
// P2-161 (run #109): 'Favorites' joins as a real filter — it narrows to the
// caller's saved venues (server list), independent of the geo sort.
const FILTER_KEYS = ['Nearby', 'Favorites', 'Indoor', 'Available Now'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABEL_MAP: Record<FilterKey, string> = {
    Nearby: 'clubs.filters.nearby',
    Favorites: 'clubs.favorites',
    Indoor: 'clubs.filters.indoor',
    'Available Now': 'clubs.filters.availableNow',
};

function ClubsContent() {
    // P2-165 (run #111): `?tab=favorites` deep-links (profile "My favorite
    // clubs" row, share links) land on the Favorites filter. One-shot read —
    // the pills remain the runtime control; no bidirectional URL sync.
    // useSearchParams needs a Suspense boundary (verify-page precedent).
    const searchParams = useSearchParams();
    const deepLinkTab = searchParams.get('tab');
    const initialFilter: FilterKey =
        deepLinkTab === 'favorites' ? 'Favorites' : 'Nearby';
    const [activeFilter, setActiveFilter] = useState<FilterKey>(initialFilter);
    const [searchQuery, setSearchQuery] = useState('');
    const t = useTranslations();
    const isOnline = useOnlineStatus();
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    // Search suggestions (2026-09-18): picking a city/neighborhood chip pins
    // `suggestedFilter` — the club list then shows ONLY venues in that
    // suggestion (server ?search= + client neighborhood pin). Typing free
    // text CLEARS the pin, so the two inputs never fight each other.
    const [suggestedFilter, setSuggestedFilter] = useState<string | null>(null);
    const {
        suggestions,
        open,
        listRef,
        handleFocus,
        handleBlur,
        dismiss,
        isLoading: suggestionsLoading,
    } = useSearchSuggestions();
    // P1-28 (run #21): search now runs SERVER-side (?search= additive name/
    // city/address ILIKE over the whole venues table) — debounce the input
    // 300ms so the queryKey change triggers one refetch, not one per keystroke.
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const { coords } = useLocation();

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const {
        data: venues,
        isLoading,
        error,
        refetch,
    } = useVenues({
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        search: debouncedSearch || undefined,
    });

    // ── P2-161: favorites (run #109) ──────────────────────────────────────
    // Id set drives the card hearts; the toggle is optimistic with rollback.
    // The 'Favorites' pill narrows to the ids ∩ fetched list (search still
    // applies server-side, so typing inside the pill searches saved clubs).
    // PR-Agent run-#109: ids LOADING is distinct from EMPTY — while the ids
    // query is in flight the pill shows the full list instead of flashing the
    // onboarding empty state at users who have favorites.
    const {
        data: favIds,
        isLoading: favIdsLoading,
        isError: favIdsError,
        refetch: refetchFavIds,
    } = useVenueFavoriteIds();
    const favSet = favIds ?? [];
    const favoriteToggle = useVenueFavoriteToggle();
    const showToast = useAppStore((s) => s.showToast);
    const isHydrated = useAppStore((s) => s.isHydrated);
    const storeUser = useAppStore((s) => s.user);

    // Pills filter the (already server-searched) fetched set client-side, then
    // Nearby applies a stable ascending distance sort — null/missing distance
    // (location denied / non-geo rows) always sorts LAST, ties keep API order.
    // (Run #68, P2-13 residual: Nearby was previously a no-op pill.)
    // P2-161: 'Favorites' narrows to saved venues (ids ∩ fetched list).
    const filteredVenues = (venues ?? []).filter((v) => {
        // A tapped suggestion pins the list to its neighborhood (server search
        // already matched city/address; this narrows to the exact district).
        if (suggestedFilter && !v.address.toLowerCase().includes(suggestedFilter.toLowerCase())) {
            return false;
        }
        if (activeFilter === 'Favorites') {
            // PR-Agent run-#109: while the ids query loads, show all (no
            // false "no favorites" flash). Run #110: an ids ERROR with NO
            // data fail-opens (an empty favSet must never render the "No
            // favorites yet" onboarding at users whose favorites merely
            // failed to load) — but an error WITH stale cached ids keeps
            // narrowing per that usable set (PR-Agent r3: React Query
            // retains data across background-refetch failures; r4: `[]` is
            // a KNOWN empty set, so only `undefined` ids fail open —
            // matching the heart-disabled condition). The amber strip
            // warns in both error cases. r6: BEFORE the store rehydrates
            // (isHydrated=false) auth state is unknown and the ids query
            // is auth-disabled — fail-open then too (r6 finding 1: a
            // logged-in user's first paint must not show the false-empty).
            if (!isHydrated || favIdsLoading) return true;
            if (favIdsError && !favIds) return true;
            return favSet.includes(v.id);
        }
        if (activeFilter === 'Indoor') {
            const amenities = Array.isArray(v.amenities) ? (v.amenities as string[]) : [];
            return amenities.includes('indoors') || amenities.includes('indoor');
        }
        // P2-13 (run #17): real open-now logic backed by venue hours (P1-25).
        if (activeFilter === 'Available Now') return isVenueOpenNow(v);
        return true;
    });
    if (activeFilter === 'Nearby') {
        filteredVenues.sort((a, b) => {
            const da = a.distance_m;
            const db = b.distance_m;
            if (da == null && db == null) return 0;
            if (da == null) return 1;
            if (db == null) return -1;
            return da - db;
        });
    }

    const visibleSuggestions = filterSuggestions(suggestions, searchQuery);

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

            {/* P2-31(4)/P2-52: offline banner — shared component (run #40) */}
            <OfflineBanner isOffline={!isOnline} />

            {/* ── Search + dynamic suggestion chips ── */}
            <div className="px-5 pb-3">
                <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green transition-colors">
                    <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setSuggestedFilter(null); // free text unpins a chip
                        }}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') dismiss();
                        }}
                        placeholder={t('clubs.searchPlaceholder')}
                        className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
                        aria-label={t('clubs.searchPlaceholder')}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('');
                                setSuggestedFilter(null);
                                dismiss();
                            }}
                            aria-label={t('common.clear')}
                            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 active:scale-95 transition-transform flex-shrink-0"
                        >
                            <X className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                        </button>
                    )}
                </div>
                {/* Suggestion chips — dynamic location filters UNDER the search
                    bar (2026-09-18 redesign, replaces the overlay dropdown):
                    tags change with the typed text, a tap pins the venue list
                    to that neighborhood. Empty = renders nothing. */}
                {open && (
                    <SuggestionChips
                        id="clubs-search-suggestions"
                        suggestions={visibleSuggestions}
                        onSelect={(s) => {
                            // Toggle-pin: tapping the active chip unpins it
                            // without blurring the input.
                            setSearchQuery((prev) =>
                                prev === s.neighborhood ? '' : s.neighborhood,
                            );
                            setSuggestedFilter((prev) =>
                                prev === s.filterValue ? null : s.filterValue,
                            );
                        }}
                        selectedValue={suggestedFilter}
                        listRef={listRef}
                        isLoading={suggestionsLoading}
                    />
                )}
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

            {/* ── Favorites ids error strip (run #110) ──
                role=status (a11y lens): an ids fetch failure must say so —
                the fail-open filter keeps the list visible, this tells the
                user WHY hearts are inert (PR-Agent r2: on EVERY tab, since
                the disabled-hearts guard is tab-independent) and offers
                Retry. ── */}
            {isHydrated && storeUser && favIdsError && !favIdsLoading && (
                <div
                    role="status"
                    className="flex items-center justify-between gap-3 mx-5 mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3"
                >
                    <p className="text-sm text-amber-900">{t('clubs.favoritesError')}</p>
                    <button
                        type="button"
                        onClick={() => refetchFavIds()}
                        className="text-sm font-bold text-brand-green active:scale-95 transition-transform whitespace-nowrap"
                    >
                        {t('common.retry')}
                    </button>
                </div>
            )}

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
                    <h3 className="text-lg font-bold text-brand-black mb-6 text-center">{t(errorKey(classifyError(error)))}</h3>
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
                        {activeFilter === 'Favorites' ? (
                            <Heart className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
                        ) : (
                            <MapPin className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-brand-black mb-1">
                        {/* P2-165 (run #111): a hydrated GUEST on Favorites sees
                            the sign-in prompt AS the title — the "No favorites
                            yet" onboarding copy would read as "you have none"
                            (FAV-13). Signed-in users keep the original copy. */}
                        {activeFilter === 'Favorites' && isHydrated && !storeUser
                            ? t('clubs.favoritesSignInTitle')
                            : activeFilter === 'Favorites'
                              ? t('clubs.favoritesEmptyTitle')
                              : venues && venues.length > 0
                                ? t('common.noResults')
                                : t('clubs.noClubs')}
                    </h3>
                    {/* Run #68: split the advice line — "adjust your filters" is
                        only true when venues exist but none match the filter;
                        a truly empty table needs the no-clubs copy instead.
                        P2-161: the Favorites pill gets its own onboarding copy.
                        Guest favorites swap it for the CTA below (no double
                        messaging). */}
                    {!(activeFilter === 'Favorites' && isHydrated && !storeUser) && (
                        <p className="text-sm text-gray-400 text-center mb-6">
                            {activeFilter === 'Favorites'
                                ? t('clubs.favoritesEmptyDesc')
                                : venues && venues.length > 0
                                  ? t('clubs.noClubsDescription')
                                  : t('clubs.noClubsEmpty')}
                        </p>
                    )}
                    {/* P2-165 (run #111): guest CTA — the ids query is
                        auth-disabled for guests, so the empty state would
                        otherwise dead-end them (run #110 follow-up). */}
                    {activeFilter === 'Favorites' && isHydrated && !storeUser && (
                        <Link
                            href={`/${locale}/login`}
                            className="bg-brand-green text-white px-6 py-3 rounded-full text-sm font-bold active:scale-95 transition-transform"
                        >
                            {t('clubs.favoritesSignInCta')}
                        </Link>
                    )}
                </div>
            )}

            {/* ── Populated ── */}
            {!isLoading && !error && filteredVenues.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-5">
                    {filteredVenues.map((venue) => (
                        <div
                            key={venue.id}
                            className="relative bg-white rounded-2xl shadow-card animate-fade-in-up transition-shadow hover:shadow-card-hover active:scale-[0.99]"
                        >
                            {/* ── P2-161: favorite heart as a SIBLING overlay
                                (PR-Agent run-#109: button inside <a> violates
                                the HTML content model / validateDOMNesting) ── */}
                            <button
                                type="button"
                                aria-pressed={favSet.includes(venue.id)}
                                aria-label={favSet.includes(venue.id) ? t('clubs.favoriteRemove') : t('clubs.favoriteAdd')}
                                disabled={
                                    // Run #110 (PR-Agent r1+r2+r6+r7): unknown
                                    // heart state must be inert — ids
                                    // loading, auth store not yet
                                    // rehydrated, a signed-out visitor, or
                                    // error with NO usable cached ids. A tap
                                    // on a mislabeled heart would silently
                                    // UNfavorite a saved venue (a guest tap
                                    // can only 401). Stale cached ids stay
                                    // usable (strip warns). Strip+Retry below
                                    // explains dead hearts on every tab.
                                    (favoriteToggle.isPending &&
                                        favoriteToggle.variables?.venueId === venue.id) ||
                                    !isHydrated ||
                                    !storeUser ||
                                    favIdsLoading ||
                                    (favIdsError && !favIds)
                                }
                                onClick={() => {
                                    favoriteToggle.mutate(
                                        { venueId: venue.id },
                                        {
                                            onError: () =>
                                                showToast(t('errors.favoriteFailed'), 'error'),
                                        },
                                    );
                                }}
                                className="absolute top-3 end-3 z-10 w-9 h-9 rounded-full bg-white/90 shadow-sm flex items-center justify-center active:scale-90 transition-transform"
                            >
                                <Heart
                                    className={`w-[18px] h-[18px] transition-colors ${
                                        favSet.includes(venue.id)
                                            ? 'fill-brand-red text-brand-red'
                                            : 'text-gray-400'
                                    }`}
                                    strokeWidth={2}
                                />
                            </button>
                            <Link
                                href={`/${locale}/clubs/${venue.id}`}
                                className="block p-4"
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
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// P2-165 (run #111): useSearchParams requires a Suspense boundary (bails the
// prerender otherwise — verify-page pattern). The list is the fallback shape.
export default function ClubsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col min-h-full items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-green" />
                </div>
            }
        >
            <ClubsContent />
        </Suspense>
    );
}
