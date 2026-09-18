import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import SuggestionDropdown from '@/components/search/SuggestionDropdown';
import type { SearchSuggestion } from '@/lib/search-suggestions';

/**
 * SuggestionDropdown specs: grouped headers, localized plural chips,
 * the localized empty state, and skeleton loading. Click-gating (open only
 * after focus) lives in the page-level integration specs.
 */

const ITEMS: SearchSuggestion[] = [
    { city: 'Riyadh', neighborhood: 'Olaya', venueCount: 3, filterValue: 'Olaya' },
    { city: 'Riyadh', neighborhood: 'Al-Malqa', venueCount: 1, filterValue: 'Al-Malqa' },
    { city: 'Jeddah', neighborhood: 'Al-Nakheel', venueCount: 2, filterValue: 'Al-Nakheel' },
];

function renderDropdown(overrides: Partial<Parameters<typeof SuggestionDropdown>[0]> = {}) {
    const props = {
        suggestions: ITEMS,
        onSelect: vi.fn(),
        listRef: { current: null },
        query: '',
        isLoading: false,
        id: 'test-suggestions',
        ...overrides,
    };
    return render(
        <NextIntlClientProvider messages={enMessages} locale="en">
            <SuggestionDropdown {...props} />
        </NextIntlClientProvider>,
    );
}

describe('SuggestionDropdown', () => {
    it('renders city group headers via i18n keys (Riyadh, Jeddah)', () => {
        renderDropdown();
        expect(screen.getByText('Riyadh')).toBeInTheDocument();
        expect(screen.getByText('Jeddah')).toBeInTheDocument();
    });

    it('renders neighborhood chips in popularity order with localized venue counts', () => {
        renderDropdown();
        const chips = screen.getAllByRole('option');
        expect(chips).toHaveLength(3);
        // DOM order = popularity order from the API.
        expect(chips[0].textContent).toContain('Olaya');
        expect(chips[1].textContent).toContain('Al-Malqa');
        expect(chips[2].textContent).toContain('Al-Nakheel');
        // searchSuggestions.venuesHere plural: 3 → "3 clubs", 1 → "1 club"
        expect(chips[0].textContent).toContain('3 clubs');
        expect(chips[1].textContent).toContain('1 club');
    });

    it('fires onSelect when a chip is clicked (combobox option)', () => {
        const onSelect = vi.fn();
        renderDropdown({ onSelect });
        fireEvent.click(screen.getByText('Al-Nakheel'));
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ neighborhood: 'Al-Nakheel', filterValue: 'Al-Nakheel' }),
        );
    });

    it('shows the localized empty state with the typed query (edge state 5)', () => {
        renderDropdown({ suggestions: [], query: 'Dammam' });
        expect(screen.getByText('No matches')).toBeInTheDocument();
        expect(screen.getByText('Nothing in "Dammam" yet')).toBeInTheDocument();
    });

    it('shows skeletons while loading (UX state 1) — never a false empty', () => {
        const { container } = renderDropdown({ suggestions: [], isLoading: true });
        expect(container.querySelector('.animate-pulse')).not.toBeNull();
        expect(screen.queryByText('No matches')).toBeNull();
    });

    it('exposes role=listbox with options (aria combobox pattern)', () => {
        renderDropdown();
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3);
    });

    it('chips keep input focus on mousedown (no blur-flicker mid-tap)', () => {
        renderDropdown();
        const chip = screen.getAllByTestId('search-suggestion-option')[0];
        const event = fireEvent.mouseDown(chip);
        // preventDefault on mousedown = the browser will not move focus.
        expect(event).toBe(false);
    });
});
