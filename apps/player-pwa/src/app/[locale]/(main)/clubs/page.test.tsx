import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

/**
 * Clubs page — dynamic search suggestion chips (2026-09-18 redesign).
 *
 * The Clubs search shares the exact chip idiom as Play (SuggestionChips +
 * useSearchSuggestions): chips render only on focus, change with the typed
 * text, render NOTHING on a zero match, and a tap pins the venue list to
 * that neighborhood. Rendering the whole page asserts the INTEGRATION —
 * same component, same visibility contract, real useVenues mocked.
 */

const pushMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/clubs',
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/useVenues', () => ({
    useVenues: vi.fn(() => ({ data: [], isLoading: false, error: null, refetch: vi.fn() })),
}));

vi.mock('@/providers/LocationProvider', () => ({
    useLocation: () => ({ coords: null, request: vi.fn(), loading: false }),
}));

vi.mock('@/hooks/useOnlineStatus', () => ({
    useOnlineStatus: () => true,
}));

vi.mock('@/lib/fetcher', () => ({
    fetcher: vi.fn(() =>
        Promise.resolve([
            { city: 'Riyadh', neighborhood: 'Al-Malqa', venue_count: 5 },
            { city: 'Jeddah', neighborhood: 'Al-Nakheel', venue_count: 3 },
        ]),
    ),
}));

import ClubsPage from './page';

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                <ClubsPage />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

describe('Clubs page — dynamic search suggestion chips', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('chips appear on focus, re-filter per query, and vanish (not an empty panel) on zero match', async () => {
        renderPage();
        expect(screen.queryByTestId('search-suggestion-chips')).toBeNull();

        const input = screen.getByLabelText('Search clubs');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        // Popular nationwide set on focus.
        expect(screen.getByTestId('search-suggestion-chips')).toBeInTheDocument();
        expect(screen.getAllByTestId('search-suggestion-chip')).toHaveLength(2);

        // Typing a city narrows the chips to that city's neighborhoods.
        fireEvent.change(input, { target: { value: 'Jeddah' } });
        const chips = screen.getAllByTestId('search-suggestion-chip');
        expect(chips).toHaveLength(1);
        expect(chips[0].textContent).toContain('Al-Nakheel');

        // Zero-match query → the row renders NOTHING (regression guard for
        // the removed dropdown's "No matches" desktop panel).
        fireEvent.change(input, { target: { value: 'zzz-none' } });
        expect(screen.queryByTestId('search-suggestion-chips')).toBeNull();
        expect(screen.queryByText(/Nothing in/)).toBeNull();
    });

    it('tapping a chip pins the venue list to the neighborhood (toggle filter)', async () => {
        renderPage();
        const input = screen.getByLabelText('Search clubs');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        const chip = screen
            .getAllByTestId('search-suggestion-chip')
            .find((el) => el.textContent!.includes('Al-Nakheel'))!;
        fireEvent.click(chip);

        // Pin = the chip's wire value (never the display label); the input
        // carries the neighborhood text; the chip is the visible undo.
        expect(input).toHaveValue('Al-Nakheel');
        expect(chip.getAttribute('aria-pressed')).toBe('true');
    });
});
