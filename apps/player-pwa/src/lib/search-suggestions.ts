// ─────────────────────────────────────────────────────────────────────────────
// Search suggestions — shared logic for the Play and Clubs search bars.
// Neighborhood suggestion chips served by GET /venues/suggestions (the API
// extracts them from venue addresses — see venues.service.extractNeighborhood).
// This module is UI-pure: filtering, Arabic normalization, grouping, and the
// label/i18n mapping. No React, no fetching (hooks/useSearchSuggestions).
// ─────────────────────────────────────────────────────────────────────────────

/** Raw row from GET /venues/suggestions. */
export interface SuggestionApi {
  city: string;
  neighborhood: string;
  venue_count: number;
}

/** UI-shaped suggestion (camelCase + the value sent to filter APIs). */
export interface SearchSuggestion {
  city: string;
  neighborhood: string;
  venueCount: number;
  /**
   * Wire value for filtering:
   *  - Clubs → sent as `search` (venues endpoint ILIKEs name/city/address).
   *  - Play  → sent as `neighborhood` (matches endpoint ILIKEs the address).
   * The NEIGHBORHOOD is the filter — never the display label's city prefix.
   */
  filterValue: string;
  /**
   * Optional i18n key for the neighborhood's localized display name
   * (e.g. "Al-Malqa" → "الملقا" in ar). Unknown neighborhoods have no key
   * and render their raw address-derived value.
   */
  labelKey?: string;
  /** Localized display label resolved from labelKey (set by the hook). */
  label?: string;
  /** Localized city display label (e.g. "Riyadh" → "الرياض"; set by the hook). */
  cityLabel?: string;
}

/**
 * Known-neighborhood i18n label keys, keyed by the normalized (lowercase,
 * dashes→spaces) address-derived value. Cities map through CITY_I18N_KEYS;
 * neighborhoods through this — both because they arrive as DATA.
 */
export const NEIGHBORHOOD_I18N_KEYS: Record<string, string> = {
  'al malqa': 'searchSuggestions.neighborhoods.alMalqa',
  olaya: 'searchSuggestions.neighborhoods.olaya',
  'king saud university campus': 'searchSuggestions.neighborhoods.ksu',
  'al nakheel': 'searchSuggestions.neighborhoods.alNakheel',
};

/** Resolves the i18n key for an address-derived neighborhood value. */
export function neighborhoodLabelKey(neighborhood: string): string | undefined {
  return NEIGHBORHOOD_I18N_KEYS[neighborhood.trim().toLowerCase().replace(/-/g, ' ')];
}

export function adaptSuggestions(rows: SuggestionApi[]): SearchSuggestion[] {
  return (rows ?? []).map((r) => ({
    city: r.city,
    neighborhood: r.neighborhood,
    venueCount: r.venue_count,
    filterValue: r.neighborhood,
    labelKey: neighborhoodLabelKey(r.neighborhood),
  }));
}

/**
 * Arabic-aware query normalization for suggestion matching: lowercase, strip
 * diacritics, fold alef/ya/taa-marbuta variants — so a user typing "الملقه"
 * still matches "الملقا", and "olaya" matches "Olaya". (KoraLink is ar-first;
 * a case-sensitive latin-only match silently fails half the audience.)
 */
export function normalizeQuery(input: string): string {
    return (input ?? '')
        .toLowerCase()
        .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // harakat + dagger alif + tatweel
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .trim();
}

/**
 * Folds trailing "vowel-ish" Arabic letters (ا ه ة ى) so final-letter folk
 * spelling drift matches: الملقه ≈ الملقا ≈ الملقة → all fold to "الملق".
 * Applied to the QUERY only when matching (targets keep their exact fold);
 * purely an extra loose match — exact normalized matches always win first.
 */
function stripTrailingVowelish(input: string): string {
    return input.replace(/[اهةى]+$/g, '');
}

/**
 * Filter suggestions against the user's typed text.
 *  - City matches as a PREFIX ("Riy" → Riyadh) — typing a city name is the
 *    primary UX the feature is built around.
 *  - Neighborhood matches as a SUBSTRING ("malq" → Al-Malqa).
 *  - Arabic final-letter drift is tolerated via the vowelish fold.
 *  - Empty query keeps every suggestion (the location-enabled open-focus case).
 *  - `label` (the localized display name, e.g. "الملقا") is matched too, so
 *    typing in the UI language finds chips whose wire value is Latin.
 */
export function filterSuggestions(
    suggestions: SearchSuggestion[],
    query: string,
): SearchSuggestion[] {
    const q = normalizeQuery(query);
    if (!q) return suggestions;
    const qLoose = stripTrailingVowelish(q);
    const textMatches = (text: string): boolean => {
        const norm = normalizeQuery(text);
        const normLoose = stripTrailingVowelish(norm);
        return (
            norm.includes(q) ||
            (qLoose.length > 0 && norm.includes(qLoose)) ||
            (normLoose.length > 0 && (normLoose.includes(qLoose) || normLoose.startsWith(qLoose)))
        );
    };
    return suggestions.filter((s) => {
        if (textMatches(s.city) || textMatches(s.neighborhood)) return true;
        if (s.label && textMatches(s.label)) return true;
        return s.cityLabel ? textMatches(s.cityLabel) : false;
    });
}

/** Suggestion list grouped by city, preserving the API's popularity order. */
export interface SuggestionGroup {
  city: string;
  items: SearchSuggestion[];
}

export function groupSuggestions(suggestions: SearchSuggestion[]): SuggestionGroup[] {
  const groups: SuggestionGroup[] = [];
  const byCity = new Map<string, SuggestionGroup>();
  for (const s of suggestions) {
    let g = byCity.get(s.city);
    if (!g) {
      g = { city: s.city, items: [] };
      byCity.set(s.city, g);
      groups.push(g);
    }
    g.items.push(s);
  }
  return groups;
}

/**
 * Known-city i18n label keys. Cities arrive as DATA (the venues table's
 * canonical `city` value), so display names map through i18n keys instead of
 * hardcoded strings; unknown cities render their raw value.
 */
export const CITY_I18N_KEYS: Record<string, string> = {
  riyadh: 'searchSuggestions.cities.riyadh',
  jeddah: 'searchSuggestions.cities.jeddah',
};
