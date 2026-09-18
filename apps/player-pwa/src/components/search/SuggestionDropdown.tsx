'use client';

import { useTranslations } from 'next-intl';
import { MapPin, SearchX } from 'lucide-react';
import {
    groupSuggestions,
    CITY_I18N_KEYS,
    type SearchSuggestion,
} from '@/lib/search-suggestions';

interface SuggestionDropdownProps {
    /** Filtered, popularity-ranked suggestions (already text-filtered). */
    suggestions: SearchSuggestion[];
    /** Chip activation — also fired via keyboard (Enter on the chip). */
    onSelect: (suggestion: SearchSuggestion) => void;
    /** Ref from useSearchSuggestions — chip taps must not blur the input. */
    listRef: React.RefObject<HTMLDivElement | null>;
    /** Current input text (drives the localized empty state). */
    query: string;
    /** Base list still loading (open dropdown shows skeletons, never a false empty). */
    isLoading: boolean;
    /** DOM id of the listbox — the input's aria-controls points here. */
    id?: string;
}

/**
 * Shared city/neighborhood suggestion dropdown for the Play and Clubs
 * search bars. Rendered INSIDE a `relative` wrapper around the input;
 * absolute positioning keeps it overlaying content without pushing layout.
 * Chip activation uses onMouseDown+preventDefault (standard combobox trick):
 * the input never loses focus, so the dropdown can't flicker closed mid-tap.
 *
 * Root-scope translator + full key paths (skill pattern): city names map
 * through i18n keys (CITY_I18N_KEYS) because they arrive as DATA; unknown
 * cities render their raw value.
 */
export default function SuggestionDropdown({
    suggestions,
    onSelect,
    listRef,
    query,
    isLoading,
    id,
}: SuggestionDropdownProps) {
    const t = useTranslations();
    const groups = groupSuggestions(suggestions);

    const cityLabel = (city: string): string => {
        const key = CITY_I18N_KEYS[city.toLowerCase()];
        // Unknown city → render the raw value (never a raw i18n key path).
        return key ? t(key) : city;
    };

    return (
        <div
            ref={listRef}
            id={id}
            data-testid="search-suggestions"
            role="listbox"
            aria-label={t('searchSuggestions.title')}
            className="absolute top-full inset-x-0 mt-2 z-50 bg-white rounded-2xl shadow-[0_8px_30px_rgba(32,33,36,0.15)] border border-gray-100 overflow-hidden animate-fade-in-up"
        >
            <div className="max-h-[320px] overflow-y-auto scroll-container min-h-0 py-1.5">
                {/* Loading — skeletons only while the base list fetches */}
                {isLoading && (
                    <div className="px-2 space-y-1" aria-hidden="true">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-3 px-2 py-2.5 animate-pulse">
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3.5 bg-gray-200 rounded w-1/3" />
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty — localized, shows the typed text context */}
                {!isLoading && groups.length === 0 && (
                    <div className="flex flex-col items-center px-4 py-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <SearchX className="w-6 h-6 text-gray-300" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-semibold text-brand-black">
                            {t('searchSuggestions.none')}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {query.trim()
                                ? t('searchSuggestions.noneFor', { query: query.trim() })
                                : t('searchSuggestions.noneHint')}
                        </p>
                    </div>
                )}

                {/* Populated — grouped by city, popularity order from the API */}
                {!isLoading &&
                    groups.map((group) => (
                        <div key={group.city} role="group" aria-label={cityLabel(group.city)}>
                            <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-brand-green uppercase tracking-widest">
                                {cityLabel(group.city)}
                            </div>
                            {group.items.map((s) => (
                                <button
                                    key={`${s.city}-${s.neighborhood}`}
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                    onMouseDown={(e) => {
                                        // Keep input focus — the dropdown must not
                                        // blur-flicker between mousedown and click.
                                        e.preventDefault();
                                    }}
                                    onClick={() => onSelect(s)}
                                    data-testid="search-suggestion-option"
                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 text-start transition-colors"
                                >
                                    <span className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                                        <MapPin className="w-4 h-4 text-brand-green" strokeWidth={2} />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-brand-black truncate">
                                            {s.label ?? s.neighborhood}
                                        </span>
                                        <span className="block text-xs text-gray-400 truncate">
                                            {cityLabel(s.city)} ·{' '}
                                            {t('searchSuggestions.venuesHere', { count: s.venueCount })}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    ))}
            </div>
        </div>
    );
}
