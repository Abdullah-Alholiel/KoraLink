import { describe, it, expect } from 'vitest';
import {
    adaptSuggestions,
    filterSuggestions,
    groupSuggestions,
    normalizeQuery,
    CITY_I18N_KEYS,
    NEIGHBORHOOD_I18N_KEYS,
    neighborhoodLabelKey,
    type SuggestionApi,
} from '@/lib/search-suggestions';

/**
 * Pure-logic specs for the search-suggestions feature (Play + Clubs bars):
 * Arabic-aware normalization, city-prefix/neighborhood-substring filtering,
 * and city grouping that preserves API popularity order.
 */

const ROWS: SuggestionApi[] = [
    { city: 'Riyadh', neighborhood: 'Olaya', venue_count: 3 },
    { city: 'Riyadh', neighborhood: 'Al-Malqa', venue_count: 1 },
    { city: 'Jeddah', neighborhood: 'Al-Nakheel', venue_count: 1 },
];

describe('normalizeQuery', () => {
    it('lowercases latin input', () => {
        expect(normalizeQuery('OLAYA')).toBe('olaya');
    });

    it('folds Arabic alef/ya/taa-marbuta variants and diacritics', () => {
        expect(normalizeQuery('الملقـة')).toBe(normalizeQuery('الملقه'));
        expect(normalizeQuery('العَليا')).toBe(normalizeQuery('العليا'));
        expect(normalizeQuery('الريآض')).toBe(normalizeQuery('الرياض'));
    });

    it('trims whitespace', () => {
        expect(normalizeQuery('  riyadh  ')).toBe('riyadh');
    });

    it('handles empty/null-ish input', () => {
        expect(normalizeQuery('')).toBe('');
        expect(normalizeQuery(undefined as unknown as string)).toBe('');
    });
});

describe('adaptSuggestions', () => {
    it('maps snake_case rows to UI shape with the neighborhood as filterValue', () => {
        const out = adaptSuggestions(ROWS);
        expect(out[0]).toEqual({
            city: 'Riyadh',
            neighborhood: 'Olaya',
            venueCount: 3,
            filterValue: 'Olaya',
            labelKey: 'searchSuggestions.neighborhoods.olaya',
        });
    });

    it('tolerates a null/undefined list', () => {
        expect(adaptSuggestions(null as unknown as SuggestionApi[])).toEqual([]);
    });
});

describe('neighborhood label mapping', () => {
    it('resolves every seeded Riyadh/Jeddah neighborhood to an i18n key', () => {
        expect(neighborhoodLabelKey('Al-Malqa')).toBe('searchSuggestions.neighborhoods.alMalqa');
        expect(neighborhoodLabelKey('Olaya')).toBe('searchSuggestions.neighborhoods.olaya');
        expect(neighborhoodLabelKey('King Saud University Campus')).toBe(
            'searchSuggestions.neighborhoods.ksu',
        );
        expect(neighborhoodLabelKey('Al-Nakheel')).toBe('searchSuggestions.neighborhoods.alNakheel');
        expect(neighborhoodLabelKey('Unknown District')).toBeUndefined();
    });

    it('keys stay in lockstep with the messages files (no silent key drift)', () => {
        const en = require('../../src/messages/en.json') as {
            searchSuggestions: { neighborhoods: Record<string, string> };
        };
        const ar = require('../../src/messages/ar.json') as {
            searchSuggestions: { neighborhoods: Record<string, string> };
        };
        const expected = Object.values(NEIGHBORHOOD_I18N_KEYS).map((k) => k.split('.').pop()!);
        for (const leaf of expected) {
            expect(en.searchSuggestions.neighborhoods[leaf]).toBeDefined();
            expect(ar.searchSuggestions.neighborhoods[leaf]).toBeDefined();
        }
        expect(Object.keys(en.searchSuggestions.neighborhoods)).toHaveLength(expected.length);
        expect(Object.keys(ar.searchSuggestions.neighborhoods)).toHaveLength(expected.length);
    });
});

describe('filterSuggestions', () => {
    const suggestions = adaptSuggestions(ROWS);

    it('keeps everything when the query is empty (open-focus state)', () => {
        expect(filterSuggestions(suggestions, '')).toHaveLength(3);
        expect(filterSuggestions(suggestions, '   ')).toHaveLength(3);
    });

    it('matches CITY as a prefix (typing a city name is the primary UX)', () => {
        const out = filterSuggestions(suggestions, 'Riy');
        expect(out.map((s) => s.neighborhood)).toEqual(['Olaya', 'Al-Malqa']);
        // case-insensitive
        expect(filterSuggestions(suggestions, 'riy')).toHaveLength(2);
    });

    it('matches NEIGHBORHOOD as a substring', () => {
        const out = filterSuggestions(suggestions, 'malq');
        expect(out.map((s) => s.neighborhood)).toEqual(['Al-Malqa']);
    });

    it('matches Arabic input through normalization (الملقه → Al-Malqa is latin, so test Arabic data)', () => {
        const arabic = adaptSuggestions([
            { city: 'الرياض', neighborhood: 'الملقا', venue_count: 2 },
        ]);
        expect(filterSuggestions(arabic, 'الملقه')).toHaveLength(1);
        expect(filterSuggestions(arabic, 'الريا')).toHaveLength(1); // city prefix
    });

    it('matches the LOCALIZED label — Arabic query finds a Latin wire value via label', () => {
        // Wire data is Latin (address-derived); the hook attaches the ar label.
        const labeled = adaptSuggestions(ROWS).map((s) => ({
            ...s,
            label:
                s.neighborhood === 'Al-Malqa'
                    ? 'الملقا'
                    : s.neighborhood === 'Olaya'
                      ? 'العليا'
                      : s.label,
        }));
        expect(filterSuggestions(labeled, 'الملقه').map((s) => s.neighborhood)).toEqual(['Al-Malqa']);
        expect(filterSuggestions(labeled, 'العلي').map((s) => s.neighborhood)).toEqual(['Olaya']);
        // Latin still matches the same chips (wire value path unchanged)
        expect(filterSuggestions(labeled, 'malq')).toEqual([{ ...labeled[1] }]);
    });

    it('returns nothing for a non-matching query', () => {
        expect(filterSuggestions(suggestions, 'dammam')).toEqual([]);
    });
});

describe('groupSuggestions', () => {
    it('groups by city preserving first-seen (popularity) order', () => {
        const groups = groupSuggestions(adaptSuggestions(ROWS));
        expect(groups.map((g) => g.city)).toEqual(['Riyadh', 'Jeddah']);
        expect(groups[0].items.map((s) => s.neighborhood)).toEqual(['Olaya', 'Al-Malqa']);
        expect(groups[1].items.map((s) => s.neighborhood)).toEqual(['Al-Nakheel']);
    });

    it('handles an empty list', () => {
        expect(groupSuggestions([])).toEqual([]);
    });
});

describe('CITY_I18N_KEYS', () => {
    it('covers the launch cities (Riyadh + Jeddah) case-insensitively by key', () => {
        expect(CITY_I18N_KEYS['riyadh']).toBeDefined();
        expect(CITY_I18N_KEYS['jeddah']).toBeDefined();
    });
});
