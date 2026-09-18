'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/fetcher';
import { useLocation } from '@/providers/LocationProvider';
import { selectUser, useAppStore } from '@/store/useAppStore';
import {
  adaptSuggestions,
  CITY_I18N_KEYS,
  type SearchSuggestion,
  type SuggestionApi,
} from '@/lib/search-suggestions';

// ─── Search suggestions hook (Play + Clubs search bars) ────────────────
//
// Visibility contract (Abdullah, 2026-09-18): suggestions NEVER appear
// uninvited. They render ONLY after the user CLICKS (focus) the search
// input — typing alone with a never-focused bar (e.g. browser autofill)
// shows nothing. Dismissal lives in each screen: clear the query (X),
// pick a suggestion, press Escape, or blur outside the dropdown.

/**
 * Derives the user's city signal for the API call:
 *  1. Location permission granted → nearest-city resolution server-side
 *     (lat/lng — the API locks suggestions to the exact user city).
 *  2. No location → the profile's preferred location ("Riyadh"), ILIKE.
 *  3. Neither → city-wide suggestions.
 */
function useUserCityParams(): Record<string, string> {
  const { coords, status } = useLocation();
  const storeUser = useAppStore(selectUser);

  return useMemo(() => {
    const params: Record<string, string> = {};
    if (status === 'granted' && coords) {
      params.lat = String(coords.lat);
      params.lng = String(coords.lng);
      return params;
    }
    const preferred = storeUser?.preferredLocation?.trim();
    if (preferred) params.city = preferred;
    return params;
  }, [coords, status, storeUser?.preferredLocation]);
}

export interface UseSearchSuggestionsResult {
  /** Suggestions after text filtering (popularity-ranked from the API). */
  suggestions: SearchSuggestion[];
  /** True when the dropdown may render: focused AND not dismissed. */
  open: boolean;
  /** Attach to the dropdown container so chip taps don't count as blur. */
  listRef: React.RefObject<HTMLDivElement | null>;
  /** Wire onto the search <input>'s onFocus. */
  handleFocus: () => void;
  /** Wire onto the search <input>'s onBlur. */
  handleBlur: (event: { relatedTarget: EventTarget | null }) => void;
  /** Hide the dropdown until the next focus (chip tap, X, Escape). */
  dismiss: () => void;
  /** True while the base list is loading AND the dropdown is open. */
  isLoading: boolean;
}

export function useSearchSuggestions(): UseSearchSuggestionsResult {
  const cityParams = useUserCityParams();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading } = useQuery<SuggestionApi[]>({
    queryKey: ['search-suggestions', cityParams],
    queryFn: () =>
      fetcher<SuggestionApi[]>('/venues/suggestions', {
        params: Object.keys(cityParams).length > 0 ? cityParams : undefined,
      }),
    staleTime: 5 * 60 * 1000, // venues change rarely; chips are cheap to keep
    enabled: focused, // never fetched until the user actually opens the bar
  });

  const suggestions = useMemo(() => adaptSuggestions(data ?? []), [data]);

  // Localized display names (e.g. "Al-Malqa" → "الملقا", "Riyadh" →
  // "الرياض"): the dropdown renders the labels, and filterSuggestions matches
  // them so typing in the UI language finds Latin wire values.
  const t = useTranslations();
  const labeledSuggestions = useMemo(
    () =>
      suggestions.map((s) => {
        const cityKey = CITY_I18N_KEYS[s.city.toLowerCase()];
        return {
          ...s,
          label: s.labelKey ? t(s.labelKey) : undefined,
          cityLabel: cityKey ? t(cityKey) : undefined,
        };
      }),
    [suggestions, t],
  );

  const handleFocus = useCallback(() => {
    setDismissed(false);
    setFocused(true);
  }, []);

  const handleBlur = useCallback(
    (event: { relatedTarget: EventTarget | null }) => {
      // Focus moved INSIDE the dropdown (chip tap, its scrollbar) → stay open.
      const next = event.relatedTarget;
      if (next instanceof Node && listRef.current?.contains(next)) return;
      setFocused(false);
    },
    [],
  );

  const dismiss = useCallback(() => setDismissed(true), []);

  return {
    suggestions: labeledSuggestions,
    open: focused && !dismissed,
    listRef,
    handleFocus,
    handleBlur,
    dismiss,
    isLoading: isLoading && focused,
  };
}
