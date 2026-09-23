import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import SuggestionChips from './SuggestionChips';
import type { SearchSuggestion } from '@/lib/search-suggestions';

/**
 * SuggestionChips — the dynamic search-filter chip row under the Play/Clubs
 * search bars (2026-09-18 redesign). Pins the contract that replaces the
 * desktop-style overlay dropdown:
 *  - a filtered-empty set renders NULL (never an empty-state panel),
 *  - loading renders skeleton chips (stable height, not a false empty),
 *  - chips are toggle filters (aria-pressed, filled brand-green when active),
 *  - chip labels carry a city qualifier ONLY when the visible set spans
 *    multiple cities,
 *  - the rendered set is capped (maxChips) preserving popularity order,
 *  - mousedown does not steal focus from the input (blur-flicker guard).
 */

const FIXTURES: SearchSuggestion[] = [
    { city: 'Riyadh', neighborhood: 'Al-Malqa', venueCount: 5, filterValue: 'Al-Malqa', label: 'Al-Malqa', cityLabel: 'Riyadh' },
    { city: 'Riyadh', neighborhood: 'Olaya', venueCount: 4, filterValue: 'Olaya', label: 'Olaya', cityLabel: 'Riyadh' },
    { city: 'Jeddah', neighborhood: 'Al-Nakheel', venueCount: 3, filterValue: 'Al-Nakheel', label: 'Al-Nakheel', cityLabel: 'Jeddah' },
];

function renderChips(
    overrides: Partial<Parameters<typeof SuggestionChips>[0]> = {},
    suggestions: SearchSuggestion[] = FIXTURES,
) {
    const onSelect = vi.fn();
    const listRef = { current: null } as React.RefObject<HTMLDivElement | null>;
    const view = render(
        <NextIntlClientProvider messages={enMessages} locale="en">
            <SuggestionChips
                suggestions={suggestions}
                onSelect={onSelect}
                selectedValue={null}
                listRef={listRef}
                isLoading={false}
                {...overrides}
            />
        </NextIntlClientProvider>,
    );
    return { onSelect, container: view.container };
}

describe('SuggestionChips', () => {
    it('renders one toggle chip per suggestion with aria-pressed', () => {
        renderChips();
        const chips = screen.getAllByTestId('search-suggestion-chip');
        expect(chips).toHaveLength(3);
        for (const chip of chips) {
            expect(chip.getAttribute('aria-pressed')).toBe('false');
            expect(chip.className).toContain('border-gray-200');
        }
    });

    it('marks the pinned chip active (aria-pressed + filled brand-green)', () => {
        renderChips({ selectedValue: 'Olaya' });
        const chip = screen
            .getAllByTestId('search-suggestion-chip')
            .find((el) => el.textContent!.includes('Olaya'))!;
        expect(chip.getAttribute('aria-pressed')).toBe('true');
        expect(chip.className).toContain('bg-brand-green');
        expect(chip.className).not.toContain('border-gray-200');
    });

    it('renders NOTHING for an empty set — never an empty-state panel', () => {
        const { container } = renderChips({}, []);
        expect(container).toBeEmptyDOMElement();
        // Regression guards: the old dropdown's empty state.
        expect(screen.queryByText('No matches')).toBeNull();
        expect(screen.queryByTestId('search-suggestions')).toBeNull();
    });

    it('renders skeleton chips while loading (not a false empty)', () => {
        renderChips({ isLoading: true });
        expect(screen.getByTestId('search-suggestion-chips')).toBeInTheDocument();
        expect(screen.queryByTestId('search-suggestion-chip')).toBeNull();
    });

    it('adds the "· City" qualifier when the visible set spans multiple cities', () => {
        renderChips();
        expect(screen.getByText('Al-Malqa · Riyadh')).toBeInTheDocument();
        expect(screen.getByText('Al-Nakheel · Jeddah')).toBeInTheDocument();
    });

    it('omits the qualifier on a single-city set (the city is the user context)', () => {
        renderChips({}, FIXTURES.filter((s) => s.city === 'Jeddah'));
        expect(screen.getByText('Al-Nakheel')).toBeInTheDocument();
        expect(screen.queryByText(/· Jeddah/)).toBeNull();
    });

    it('caps the rendered chips (maxChips) preserving popularity order', () => {
        renderChips({ maxChips: 2 });
        const chips = screen.getAllByTestId('search-suggestion-chip');
        expect(chips).toHaveLength(2);
        expect(chips[0].textContent).toContain('Al-Malqa'); // highest venue count
    });

    it('mousedown preventDefaults (keeps input focus) and tap fires onSelect', () => {
        const { onSelect } = renderChips();
        const chip = screen.getAllByTestId('search-suggestion-chip')[2];
        // fireEvent returns false ⇔ the handler called preventDefault — the
        // blur-flicker guard the shared input-focus contract depends on.
        expect(fireEvent.mouseDown(chip)).toBe(false);
        fireEvent.click(chip);
        expect(onSelect).toHaveBeenCalledWith(FIXTURES[2]);
    });
});
