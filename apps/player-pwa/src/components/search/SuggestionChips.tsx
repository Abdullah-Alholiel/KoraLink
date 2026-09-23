'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import type { SearchSuggestion } from '@/lib/search-suggestions';

interface SuggestionChipsProps {
    /** Filtered, popularity-ranked suggestions (already text-filtered). */
    suggestions: SearchSuggestion[];
    /** Chip tap — the OWNER toggles the pin (same value tapped again = off). */
    onSelect: (suggestion: SearchSuggestion) => void;
    /** Wire value of the currently pinned chip (drives aria-pressed/active). */
    selectedValue: string | null;
    /** Ref from useSearchSuggestions — chip taps must not blur the input. */
    listRef: React.RefObject<HTMLDivElement | null>;
    /** Base list still loading (row shows skeleton chips, never a false empty). */
    isLoading: boolean;
    /** Max chips rendered — the row scrolls; the rest are a tap-refine away. */
    maxChips?: number;
    /** DOM id — the input's aria-controls points here. */
    id?: string;
}

/**
 * Dynamic search-filter CHIPS for the Play and Clubs search bars
 * (2026-09-18 redesign, Abdullah): tags rendered INLINE under the search bar
 * that change with the typed text — typing "Jeddah" surfaces Jeddah
 * neighborhoods, clearing text restores the popular nationwide chips.
 *
 * This replaces the desktop-style overlay dropdown:
 *  - Chips are toggle filters (aria-pressed, active = filled brand-green),
 *    not a combobox listbox.
 *  - A filtered-empty result renders NOTHING (null → zero height) — never an
 *    empty-state panel; the matches list below keeps live-filtering.
 *  - Loading renders skeleton chips so the row height never jumps.
 *
 * Chip taps keep input focus via the shared blur guard (listRef); the row
 * hides on input blur and returns on the next focus.
 *
 * Root-scope translator: city/neighborhood names arrive as DATA and map
 * through i18n keys (CITY_I18N_KEYS etc.) in the hook; unknown values render
 * their raw wire value.
 */
export default function SuggestionChips({
    suggestions,
    onSelect,
    selectedValue,
    listRef,
    isLoading,
    maxChips = 10,
    id,
}: SuggestionChipsProps) {
    const t = useTranslations();

    const visible = useMemo(() => suggestions.slice(0, maxChips), [suggestions, maxChips]);

    // City qualifier on the chip label ONLY when the visible set spans more
    // than one city ("Olaya · Riyadh"); a single-city set ("Jeddah…" typed)
    // keeps chips lean — the city is already the user's context.
    const multiCity = useMemo(
        () => new Set(visible.map((s) => s.city)).size > 1,
        [visible],
    );

    // Loading → skeleton chips (stable row height, no layout jump).
    if (isLoading) {
        return (
            <div ref={listRef} id={id} data-testid="search-suggestion-chips" className="flex items-center gap-2 px-4 py-2 overflow-x-auto scroll-container" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-8 w-20 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                ))}
            </div>
        );
    }

    // Filtered-empty → render NOTHING. The chips are dynamic filters; an
    // empty intersection is expressed by the (still live-filtered) matches
    // list below, never by an empty-state panel (the removed dropdown bug).
    if (visible.length === 0) return null;

    return (
        <div
            ref={listRef}
            id={id}
            data-testid="search-suggestion-chips"
            role="group"
            aria-label={t('searchSuggestions.title')}
            className="flex items-center gap-2 px-4 py-2 overflow-x-auto scroll-container"
        >
            {visible.map((s) => {
                const active = selectedValue === s.filterValue;
                const label = s.label ?? s.neighborhood;
                const cityPart = multiCity ? ` · ${s.cityLabel ?? s.city}` : '';
                return (
                    <button
                        key={`${s.city}-${s.neighborhood}`}
                        type="button"
                        aria-pressed={active}
                        data-testid="search-suggestion-chip"
                        onMouseDown={(e) => {
                            // Keep input focus — the chips row must not
                            // blur-flicker between mousedown and click.
                            e.preventDefault();
                        }}
                        onClick={() => onSelect(s)}
                        className={`flex min-h-hit flex-shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                            active
                                ? 'bg-brand-green text-white'
                                : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                    >
                        <MapPin
                            className={`w-3 h-3 flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`}
                            strokeWidth={2}
                            aria-hidden="true"
                        />
                        <span>{label}{cityPart}</span>
                    </button>
                );
            })}
        </div>
    );
}
