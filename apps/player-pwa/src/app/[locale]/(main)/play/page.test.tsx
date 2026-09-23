import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

/**
 * Play page header tests (Abdullah, 2026-09-03 redesign; compact pill
 * 2026-09-09): the "+ Host a Match" pill next to search is COMPACT —
 * single-line label, no hint line — and search + calendar + filter bar
 * live in ONE sticky group that pins while scrolling the games list.
 *
 * 2026-09-18 search-chips redesign (Abdullah): suggestions are DYNAMIC
 * FILTER CHIPS under the search bar (never the old desktop-style overlay
 * dropdown, never an empty-state panel). The chips:
 *  - render only while the bar is focused (never on initial load),
 *  - change with the typed text (Arabic-aware filterSuggestions),
 *  - render NOTHING when the filter matches zero suggestions,
 *  - pin the matches list server-side via the `neighborhood` param on tap
 *    (debounced 200ms on the page — assertions flush the timer),
 *  - toggle OFF when the active chip is tapped again,
 *  - live INSIDE the pinned header (inline row under the search bar).
 *
 * The page pulls useMatches/useLocation; both are mocked (no network/socket).
 */

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/play',
    useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn() }),
}));

const mockMatches = vi.hoisted(() => vi.fn(() => ({
    matches: [], isLoading: false, error: null, refetch: vi.fn(),
    hasMore: false, fetchNextPage: vi.fn(), isFetchingNextPage: false,
})));

vi.mock('@/hooks/useMatches', () => ({
    useMatches: mockMatches,
}));

vi.mock('@/providers/LocationProvider', () => ({
    useLocation: () => ({ coords: null, request: vi.fn(), loading: false }),
}));

// The nationwide suggestions fetch — mocked so no network is touched. The
// set spans TWO cities to prove the chips re-filter dynamically per query.
vi.mock('@/lib/fetcher', () => ({
    fetcher: vi.fn(() =>
        Promise.resolve([
            { city: 'Riyadh', neighborhood: 'Al-Malqa', venue_count: 5 },
            { city: 'Riyadh', neighborhood: 'Olaya', venue_count: 4 },
            { city: 'Jeddah', neighborhood: 'Al-Nakheel', venue_count: 3 },
            { city: 'Jeddah', neighborhood: 'Al-Basateen', venue_count: 2 },
        ]),
    ),
}));

import PlayPage from './page';

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                <PlayPage />
            </NextIntlClientProvider>
        </QueryClientProvider>
    );
}

describe('Play page — host pill + pinned header group', () => {
    it('shows the labeled "+ Host a Match" pill next to search, linking to /en/host', () => {
        renderPage();
        const pill = screen.getByTestId('host-plus-button');
        expect(pill).toHaveAttribute('href', '/en/host');
        expect(pill).toHaveTextContent('Host a Match');
    });

    it('pill is COMPACT single-line (no hint line) on solid brand-green (2026-09-09)', () => {
        renderPage();
        const pill = screen.getByTestId('host-plus-button');
        // Featured = solid brand-green surface (no outline), soft shadow.
        expect(pill.className).toContain('bg-brand-green');
        expect(pill.className).not.toContain('border-');
        expect(pill.className).toContain('shadow-');
        // Compact = exactly ONE text line — the hint ("Create your game —…")
        // was removed (Abdullah, 2026-09-09) and its i18n key deleted.
        expect(pill).toHaveTextContent('Host a Match');
        expect(pill.textContent).not.toContain('Create your game');
    });

    it('pins app bar + search + calendar, but NOT the filter bar (Abdullah, r4)', () => {
        const { container } = renderPage();
        // The sticky container exists from scroll-zero (no empty-gap problem)
        const sticky = container.querySelector('.sticky.top-0.z-40');
        expect(sticky).not.toBeNull();
        // App bar (icon + title + bell) is INSIDE the sticky container
        expect(sticky!.textContent).toContain('KoraLink');
        // Calendar strip renders inside the group
        expect(screen.getAllByRole('button').length).toBeGreaterThan(3);
        // Filter chips are OUTSIDE the sticky container — they scroll away
        const stickyDiv = sticky as HTMLElement;
        const formatChip = screen.getAllByText('5v5')[0];
        expect(stickyDiv.contains(formatChip)).toBe(false);
    });

    it('shows the app icon next to the KoraLink title (not the trophy)', () => {
        const { container } = renderPage();
        const img = container.querySelector('img[alt=""]');
        expect(img).not.toBeNull();
        expect(img!.getAttribute('src')).toContain('icon-192x192');
    });

    it('host pill can SHRINK (no flex-shrink-0) and truncates its text — it may never push the frame past the screen (Abdullah, 2026-09-09 production overflow)', () => {
        renderPage();
        const pill = screen.getByTestId('host-plus-button');
        // The pill must be allowed to shrink inside the flex row.
        expect(pill.className).not.toContain('flex-shrink-0');
        expect(pill.className).toContain('min-w-0');
        // The single compact label truncates instead of forcing width.
        const truncated = pill.querySelectorAll('.truncate');
        expect(truncated.length).toBe(1);
        // The search field is also shrinkable (min-w-0) so the row fits 320px.
        const searchWrap = pill.parentElement!.firstElementChild as HTMLElement;
        expect(searchWrap.className).toContain('min-w-0');
    });
});

describe('Play page — dynamic search suggestion chips (2026-09-18 redesign)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockMatches.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Focus the bar and let the nationwide list resolve. */
    function focusSearch(): HTMLInputElement {
        const input = screen.getByLabelText('Where to play?') as HTMLInputElement;
        act(() => {
            fireEvent.focus(input);
            vi.advanceTimersByTime(0); // flush react-query state updates
        });
        return input;
    }

    /** Type a query + flush the 200ms neighborhood-pin debounce. */
    function typeQuery(input: HTMLInputElement, value: string) {
        act(() => {
            fireEvent.change(input, { target: { value } });
            vi.advanceTimersByTime(250);
        });
    }

    it('chips are ABSENT on initial render — they appear only after focusing the bar', async () => {
        renderPage();
        expect(screen.queryByTestId('search-suggestion-chips')).toBeNull();
        focusSearch();
        await act(async () => { await vi.runAllTimersAsync(); });
        expect(screen.getByTestId('search-suggestion-chips')).toBeInTheDocument();
    });

    it('chips render INSIDE the pinned header (inline under search, not an overlay)', async () => {
        const { container } = renderPage();
        focusSearch();
        await act(async () => { await vi.runAllTimersAsync(); });
        const sticky = container.querySelector('.sticky.top-0.z-40') as HTMLElement;
        const chips = screen.getByTestId('search-suggestion-chips');
        expect(sticky.contains(chips)).toBe(true);
        // Overlay-dropdown regression guards: no absolute positioning.
        expect(chips.className).not.toContain('absolute');
    });

    it('typing "Jeddah" RE-FILTERS the chips dynamically to Jeddah entries', async () => {
        renderPage();
        const input = focusSearch();
        await act(async () => { await vi.runAllTimersAsync(); });
        typeQuery(input, 'Jeddah');

        const chips = screen.getAllByTestId('search-suggestion-chip');
        expect(chips.length).toBeGreaterThan(0);
        for (const chip of chips) {
            expect(chip.textContent).toMatch(/Nakheel|Basateen/);
        }
        // Riyadh-only entries are filtered out.
        expect(screen.queryByText('Al-Malqa')).toBeNull();
        expect(screen.queryByText('Olaya')).toBeNull();
    });

    it('a query matching ZERO suggestions renders NOTHING — never an empty-state panel', async () => {
        renderPage();
        const input = focusSearch();
        await act(async () => { await vi.runAllTimersAsync(); });
        typeQuery(input, 'zzzz-no-such-place');

        expect(screen.queryByTestId('search-suggestion-chips')).toBeNull();
        // The old dropdown's empty-state copy must never come back.
        expect(screen.queryByText('No matches')).toBeNull();
        expect(screen.queryByText(/Nothing in/)).toBeNull();
    });

    it('tapping a chip pins the matches list server-side (neighborhood param) and marks it active', async () => {
        renderPage();
        const input = focusSearch();
        await act(async () => { await vi.runAllTimersAsync(); });
        typeQuery(input, 'Jeddah');

        const chip = screen
            .getAllByTestId('search-suggestion-chip')
            .find((el) => el.textContent!.includes('Al-Nakheel'))!;
        fireEvent.click(chip);
        act(() => { vi.advanceTimersByTime(250); }); // pin debounce

        // Server-side filter via useMatches args (the wire value is the
        // neighborhood, never the display label — skill §1 pitfall).
        expect(mockMatches).toHaveBeenLastCalledWith(
            expect.objectContaining({ neighborhood: 'Al-Nakheel' }),
        );
        // The chip stays visible + active (filled) as the undo affordance.
        expect(chip.getAttribute('aria-pressed')).toBe('true');
        expect(chip.className).toContain('bg-brand-green');
    });

    it('tapping the ACTIVE chip again unpins (toggle off) and clears the query', async () => {
        renderPage();
        const input = focusSearch();
        await act(async () => { await vi.runAllTimersAsync(); });
        typeQuery(input, 'Jeddah');

        const chip = screen
            .getAllByTestId('search-suggestion-chip')
            .find((el) => el.textContent!.includes('Al-Nakheel'))!;

        fireEvent.click(chip); // pin
        act(() => { vi.advanceTimersByTime(250); });
        fireEvent.click(chip); // unpin
        act(() => { vi.advanceTimersByTime(250); });

        expect(mockMatches).toHaveBeenLastCalledWith(
            expect.objectContaining({ neighborhood: null }),
        );
        // Query cleared with it (the pin and the text never fight).
        expect(input).toHaveValue('');
    });
});
