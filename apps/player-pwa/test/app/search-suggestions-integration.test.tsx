import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

/**
 * Search-suggestions INTEGRATION specs — 2026-09-18 CHIPS REDESIGN.
 *
 * Replaces the dropdown-era specs: suggestions are now dynamic filter chips
 * under the search bar (Abdullah: no desktop-style overlay, no empty-state
 * panel). The visibility CONTRACT under test:
 *   1. Chips NEVER render before the user focuses the search input — not on
 *      mount, not from browser autofill.
 *   2. Focus shows the popular nationwide chips; the list is fetched ONCE
 *      (parameterless API) and filtered per keystroke — typing "Jeddah" on a
 *      Riyadh profile surfaces Jeddah hoods (the old city-locked fetch could
 *      only ever yield an empty panel here).
 *   3. A chip tap pins the filter (Play → server `neighborhood` param;
 *      Clubs → pinned venue list); tapping the active chip toggles it off.
 *   4. A zero-match query renders NOTHING — the matches list below keeps
 *      live-filtering; no "No matches" panel ever appears in the header.
 *
 * Play page mocks: useMatches + LocationProvider + fetcher (no network).
 * Clubs page mocks: useVenues + LocationProvider + fetcher.
 */

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const useMatchesMock = vi.hoisted(() => vi.fn());
const useVenuesMock = vi.hoisted(() => vi.fn());
const fetcherMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/play',
    useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn() }),
}));

vi.mock('@/hooks/useMatches', () => ({
    useMatches: useMatchesMock,
}));

vi.mock('@/hooks/useVenues', () => ({
    useVenues: useVenuesMock,
}));

vi.mock('@/providers/LocationProvider', () => ({
    useLocation: () => ({ coords: null, request: vi.fn(), loading: false }),
}));

vi.mock('@/lib/fetcher', () => ({
    fetcher: fetcherMock,
}));

import PlayPage from '@/app/[locale]/(main)/play/page';
import ClubsPage from '@/app/[locale]/(main)/clubs/page';

const SUGGESTIONS_API = [
    { city: 'Riyadh', neighborhood: 'Al-Malqa', venue_count: 5 },
    { city: 'Riyadh', neighborhood: 'Olaya', venue_count: 4 },
    { city: 'Jeddah', neighborhood: 'Al-Nakheel', venue_count: 3 },
];

function emptyMatchesResult() {
    return {
        matches: [], isLoading: false, error: null, refetch: vi.fn(),
        hasMore: false, fetchNextPage: vi.fn(), isFetchingNextPage: false,
    };
}

function renderPage(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                {ui}
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

describe('Play page — search suggestion chips (integration)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useMatchesMock.mockReset().mockImplementation(() => emptyMatchesResult());
        useVenuesMock.mockReset().mockImplementation(() => ({
            data: [], isLoading: false, error: null, refetch: vi.fn(),
        }));
        fetcherMock.mockReset().mockImplementation(() => Promise.resolve(SUGGESTIONS_API));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('fetches the suggestions list ONCE on first focus (parameterless, nationwide)', async () => {
        renderPage(<PlayPage />);
        expect(fetcherMock).not.toHaveBeenCalled(); // nothing before focus

        const input = screen.getByLabelText('Where to play?');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect(fetcherMock).toHaveBeenCalledWith('/venues/suggestions');
        expect(screen.getByTestId('search-suggestion-chips')).toBeInTheDocument();
    });

    it('typing "Jeddah" surfaces JEDDAH chips regardless of the user profile city', async () => {
        renderPage(<PlayPage />);
        const input = screen.getByLabelText('Where to play?');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        act(() => {
            fireEvent.change(input, { target: { value: 'Jeddah' } });
            vi.advanceTimersByTime(250); // pin debounce flush
        });

        const chips = screen.getAllByTestId('search-suggestion-chip');
        expect(chips).toHaveLength(1);
        expect(chips[0].textContent).toContain('Al-Nakheel');
        // No "Nothing in Jeddah" empty panel — the old dropdown bug.
        expect(screen.queryByText(/Nothing in/)).toBeNull();
    });

    it('tapping a chip pins the neighborhood into the matches query (server filter)', async () => {
        renderPage(<PlayPage />);
        const input = screen.getByLabelText('Where to play?');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        const chip = screen
            .getAllByTestId('search-suggestion-chip')
            .find((el) => el.textContent!.includes('Al-Nakheel'))!;
        act(() => {
            fireEvent.click(chip);
        });
        // Separate act: the debounce effect flushes at act exit — only then
        // does the 200ms timer exist and can be advanced.
        act(() => {
            vi.advanceTimersByTime(250);
        });

        expect(useMatchesMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ neighborhood: 'Al-Nakheel' }),
        );
    });

    it('Escape dismisses the chips without clearing the typed text', async () => {
        renderPage(<PlayPage />);
        const input = screen.getByLabelText('Where to play?');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        act(() => {
            fireEvent.change(input, { target: { value: 'Jeddah' } });
            vi.advanceTimersByTime(250);
        });
        expect(screen.getByTestId('search-suggestion-chips')).toBeInTheDocument();

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByTestId('search-suggestion-chips')).toBeNull();
        expect(input).toHaveValue('Jeddah'); // the text survives dismissal
    });

    it('a zero-match query renders NO chips row — no empty-state panel in the header', async () => {
        renderPage(<PlayPage />);
        const input = screen.getByLabelText('Where to play?');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        act(() => {
            fireEvent.change(input, { target: { value: 'Nowhereville' } });
            vi.advanceTimersByTime(250);
        });

        expect(screen.queryByTestId('search-suggestion-chips')).toBeNull();
        expect(screen.queryByTestId('search-suggestions')).toBeNull(); // old dropdown id
        expect(screen.queryByText('No matches')).toBeNull();
    });
});

describe('Clubs page — search suggestion chips (integration)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useMatchesMock.mockReset().mockImplementation(() => emptyMatchesResult());
        useVenuesMock.mockReset().mockImplementation(() => ({
            data: [], isLoading: false, error: null, refetch: vi.fn(),
        }));
        fetcherMock.mockReset().mockImplementation(() => Promise.resolve(SUGGESTIONS_API));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('opens on focus; a chip tap pins the venue list neighborhood', async () => {
        renderPage(<ClubsPage />);
        expect(screen.queryByTestId('search-suggestion-chips')).toBeNull();

        const input = screen.getByLabelText('Search clubs');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect(screen.getByTestId('search-suggestion-chips')).toBeInTheDocument();

        const chip = screen
            .getAllByTestId('search-suggestion-chip')
            .find((el) => el.textContent!.includes('Al-Nakheel'))!;
        fireEvent.click(chip);

        // Clubs pins client-side: the input carries the neighborhood, and
        // useVenues receives the server ?search= text (300ms debounce).
        expect(input).toHaveValue('Al-Nakheel');
        expect(chip.getAttribute('aria-pressed')).toBe('true');
    });

    it('a zero-match query renders NOTHING — never the dropdown empty panel', async () => {
        renderPage(<ClubsPage />);
        const input = screen.getByLabelText('Search clubs');
        act(() => {
            fireEvent.focus(input);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        act(() => {
            fireEvent.change(input, { target: { value: 'Nowhereville' } });
            vi.advanceTimersByTime(350);
        });

        expect(screen.queryByTestId('search-suggestion-chips')).toBeNull();
        expect(screen.queryByText(/Nothing in/)).toBeNull();
    });
});
