import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

/**
 * Search-suggestions integration specs (2026-09-18 feature).
 *
 * The visibility CONTRACT under test (Abdullah):
 *   1. Suggestions NEVER render before the user clicks/focuses the search
 *      input — not on mount, not on typing alone.
 *   2. Focus opens the dropdown; a city/neighborhood chip applies the filter
 *      (Play → server `neighborhood` param; Clubs → pinned venue list).
 *   3. The query only fetches AFTER first focus (enabled: focused).
 *
 * Play page mocks: useMatches + LocationProvider (no network/socket).
 * Clubs page mocks: useVenues + LocationProvider.
 */

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const useMatchesMock = vi.hoisted(() => vi.fn());
const useVenuesMock = vi.hoisted(() => vi.fn());

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

import PlayPage from '@/app/[locale]/(main)/play/page';
import ClubsPage from '@/app/[locale]/(main)/clubs/page';

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

// The fetcher is network — assert it was never called before focus by
// spying on global fetch (the hook queries /venues/suggestions via fetcher).
const fetchSpy = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchSpy as unknown as typeof global.fetch;
    fetchSpy.mockResolvedValue(
        new Response(JSON.stringify([
            { city: 'Riyadh', neighborhood: 'Olaya', venue_count: 3 },
            { city: 'Riyadh', neighborhood: 'Al-Malqa', venue_count: 1 },
            { city: 'Jeddah', neighborhood: 'Al-Nakheel', venue_count: 1 },
        ]), { status: 200 }),
    );
    useMatchesMock.mockReturnValue(emptyMatchesResult());
    useVenuesMock.mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() });
});

describe('Play page — search suggestions', () => {
    it('shows NO suggestions before the user clicks the search bar (the contract)', async () => {
        renderPage(<PlayPage />);
        await waitFor(() => expect(screen.getByPlaceholderText('Where to play?')).toBeInTheDocument());
        // Give any (incorrectly immediate) query a chance to misbehave.
        await new Promise((r) => setTimeout(r, 20));
        expect(screen.queryByTestId('search-suggestions')).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('opens the dropdown on FOCUS and lists neighborhood chips grouped by city', async () => {
        renderPage(<PlayPage />);
        const input = screen.getByPlaceholderText('Where to play?');
        fireEvent.focus(input);
        await waitFor(() => expect(screen.getByTestId('search-suggestions')).toBeInTheDocument());
        // Options carry the neighborhood; headers carry the city (i18n-mapped).
        const options = await screen.findAllByRole('option');
        expect(options.length).toBe(3);
        expect(screen.getByRole('option', { name: /Al-Malqa/ })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Riyadh' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Jeddah' })).toBeInTheDocument();
    });

    it('fetches suggestions only AFTER first focus (enabled: focused)', async () => {
        renderPage(<PlayPage />);
        const input = screen.getByPlaceholderText('Where to play?');
        await new Promise((r) => setTimeout(r, 20));
        expect(fetchSpy).not.toHaveBeenCalled();
        fireEvent.focus(input);
        await waitFor(() =>
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/venues/suggestions'),
                expect.anything(),
            ),
        );
    });

    it('tapping a neighborhood chip pins it into the matches query (server filter)', async () => {
        renderPage(<PlayPage />);
        const input = screen.getByPlaceholderText('Where to play?');
        fireEvent.focus(input);
        await waitFor(() => expect(screen.getByTestId('search-suggestions')).toBeInTheDocument());
        // Wait for the chips to actually render (fetch lands async), then click.
        fireEvent.click(await screen.findByRole('option', { name: /Al-Malqa/ }));
        // The chip fills the input AND pins the neighborhood for useMatches…
        await waitFor(() => expect(useMatchesMock).toHaveBeenCalled());
        // …after the debounce window the latest call carries the pin.
        await new Promise((r) => setTimeout(r, 250));
        const calls = useMatchesMock.mock.calls;
        const latestCall = calls[calls.length - 1]?.[0] as { neighborhood?: string | null } | undefined;
        expect(latestCall?.neighborhood).toBe('Al-Malqa');
        // Dropdown dismissed after selection.
        expect(screen.queryByTestId('search-suggestions')).toBeNull();
    });

    it('Escape dismisses the dropdown without clearing the typed text', async () => {
        renderPage(<PlayPage />);
        const input = screen.getByPlaceholderText('Where to play?');
        fireEvent.focus(input);
        await waitFor(() => expect(screen.getByTestId('search-suggestions')).toBeInTheDocument());
        fireEvent.change(input, { target: { value: 'Olaya' } });
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByTestId('search-suggestions')).toBeNull();
        expect((input as HTMLInputElement).value).toBe('Olaya');
    });
});

describe('Clubs page — search suggestions', () => {
    it('shows NO suggestions before the user clicks the search bar', async () => {
        renderPage(<ClubsPage />);
        await waitFor(() => expect(screen.getByPlaceholderText('Search clubs')).toBeInTheDocument());
        await new Promise((r) => setTimeout(r, 20));
        expect(screen.queryByTestId('search-suggestions')).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('opens on focus and a chip filters the venue list client-side', async () => {
        useVenuesMock.mockReturnValue({
            data: [
                {
                    id: 'v1', name: 'Olaya Sports Park', city: 'Riyadh',
                    address: 'Olaya District, Prince Mohammed Bin Abdulaziz Rd, Riyadh 12241',
                    amenities: [], is_approved: true, is_koralink_partner: false,
                    distance_m: null, owner_id: 'o', owner_name: null, pitch_count: 2,
                },
                {
                    id: 'v2', name: 'Al-Nakheel Sports Complex', city: 'Jeddah',
                    address: 'Al-Nakheel District, King Abdulaziz Rd, Jeddah 23441',
                    amenities: [], is_approved: true, is_koralink_partner: false,
                    distance_m: null, owner_id: 'o', owner_name: null, pitch_count: 1,
                },
            ],
            isLoading: false, error: null, refetch: vi.fn(),
        });
        renderPage(<ClubsPage />);
        const input = screen.getByPlaceholderText('Search clubs');
        fireEvent.focus(input);
        await waitFor(() => expect(screen.getByTestId('search-suggestions')).toBeInTheDocument());
        // Wait for chips to render (fetch lands async), then click the Olaya
        // OPTION (role-scoped — the venue card below also contains "Olaya").
        fireEvent.click(await screen.findByRole('option', { name: /Olaya/ }));
        // Pin applies after debounce → only the Olaya venue survives.
        await new Promise((r) => setTimeout(r, 350));
        expect(screen.getByText('Olaya Sports Park')).toBeInTheDocument();
        expect(screen.queryByText('Al-Nakheel Sports Complex')).toBeNull();
        expect(screen.queryByTestId('search-suggestions')).toBeNull();
    });
});
