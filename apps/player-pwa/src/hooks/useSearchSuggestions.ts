'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/fetcher';
import {
  adaptSuggestions,
  CITY_I18N_KEYS,
  type SearchSuggestion,
  type SuggestionApi,
} from '@/lib/search-suggestions';

// ─── Search suggestion chips hook (Play + Clubs search bars) ────────────
//
// 2026-09-18 chips redesign (Abdullah): suggestions are DYNAMIC FILTER
// CHIPS rendered under the search bar — NOT a desktop-style overlay
// dropdown. The popular list is NATIONWIDE and parameterless; the client
// filters it per keystroke (Arabic-aware, lib/search-suggestions.ts), so
// typing "Jeddah" surfaces Jeddah neighborhoods for a Riyadh user and no
// keystroke ever hits the API.
//
// Visibility contract: chips render ONLY while the bar is focused AND the
// user has not dismissed them (chip tap / X / Escape). A filtered-empty
// result renders NOTHING (zero height) — never an empty-state panel; the
// matches list below keeps live-filtering on the typed text.

/**
 * Fetches the nationwide popular list ONCE per focus session (5-min React
 * Query cache, shared by Play and Clubs). No city/geo params: the old
 * nearest-city lock was the root cause of the "empty panel" bug — a locked
 * Riyadh list text-filtered by "Jeddah" could only ever be empty.
 */
function useSuggestionList(enabled: boolean) {
  return useQuery<SuggestionApi[]>({
    queryKey: ['search-suggestions', 'nationwide'],
    queryFn: () => fetcher<SuggestionApi[]>('/venues/suggestions'),
    staleTime: 5 * 60 * 1000, // venues change rarely; chips are cheap to keep
    enabled, // never fetched until the user actually focuses the bar
  });
}

export interface UseSearchSuggestionsResult {
  /** Suggestions after text filtering (popularity-ranked from the API). */
  suggestions: SearchSuggestion[];
  /** True when the chips row may render: focused AND not dismissed. */
  open: boolean;
  /** Attach to the chips row so chip taps don't count as blur. */
  listRef: React.RefObject<HTMLDivElement | null>;
  /** Wire onto the search <input>'s onFocus. */
  handleFocus: () => void;
  /** Wire onto the search <input>'s onBlur. */
  handleBlur: (event: { relatedTarget: EventTarget | null }) => void;
  /** Hide the chips until the next focus (chip tap, X, Escape). */
  dismiss: () => void;
  /** True while the base list is loading AND the chips are open. */
  isLoading: boolean;
}

export function useSearchSuggestions(): UseSearchSuggestionsResult {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading } = useSuggestionList(focused);

  const suggestions = useMemo(() => adaptSuggestions(data ?? []), [data]);

  // Localized display names (e.g. "Al-Malqa" → "الملقا", "Riyadh" →
  // "الرياض"): the chips render the labels, and filterSuggestions matches
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
      // Focus moved INSIDE the chips row (chip tap) → stay open.
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
