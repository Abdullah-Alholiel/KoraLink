import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

/**
 * Favorites ids-error state (run #110) — clubs page integration specs.
 *
 * Contract under test (docs/plans/run110-favorites-error-state/):
 *   FAV-1  ids query ERROR + Favorites pill active → the venue list stays
 *          VISIBLE (fail-open) and an error strip with Retry renders — the
 *          "No favorites yet" onboarding state must NEVER appear (that would
 *          tell a user with saved clubs their favorites are gone).
 *   FAV-2  Retry re-fires the ids query (refetch).
 *   FAV-3  Healthy ids → pill narrows to saved venues only (no strip).
 *   FAV-4  Per-heart pending isolation: toggling venue A disables only A's
 *          heart, never B's (variables-scoped pending).
 *
 * Page mocks: useVenues + useVenueFavoriteIds/useVenueFavoriteToggle +
 * LocationProvider + useSearchSuggestions + fetcher (no network, no socket).
 */

const pushMock = vi.hoisted(() => vi.fn());
const useVenuesMock = vi.hoisted(() => vi.fn());
const useVenueFavoriteIdsMock = vi.hoisted(() => vi.fn());
const useVenueFavoriteToggleMock = vi.hoisted(() => vi.fn());
const useSearchSuggestionsMock = vi.hoisted(() => vi.fn());
const showToastMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/clubs',
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/useVenues', () => ({
    useVenues: useVenuesMock,
}));

vi.mock('@/hooks/useVenueFavorites', () => ({
    useVenueFavoriteIds: useVenueFavoriteIdsMock,
    useVenueFavoriteToggle: useVenueFavoriteToggleMock,
}));

vi.mock('@/hooks/useSearchSuggestions', () => ({
    useSearchSuggestions: useSearchSuggestionsMock,
}));

vi.mock('@/providers/LocationProvider', () => ({
    useLocation: () => ({ coords: null, request: vi.fn(), loading: false }),
}));

vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }));

vi.mock('@/store/useAppStore', () => ({
    useAppStore: (sel: (s: Record<string, unknown>) => unknown) =>
        sel({ showToast: showToastMock }),
}));

import ClubsPage from '@/app/[locale]/(main)/clubs/page';

const VENUES = [
    {
        id: 'v-1', name: 'Al-Nakheel Sports Complex', city: 'Jeddah', address: 'Al-Nakheel',
        amenities: [], rating: 4.5, distance_m: 1200, pitch_count: 2, is_approved: true,
        open_hour: 8, close_hour: 23,
    },
    {
        id: 'v-2', name: 'Olaya Padel Hub', city: 'Riyadh', address: 'Olaya',
        amenities: [], rating: 4.0, distance_m: 3400, pitch_count: 1, is_approved: true,
        open_hour: 8, close_hour: 23,
    },
] as const;

const refetchIdsMock = vi.fn();
const mutateMock = vi.fn();

function idsResult(overrides: Record<string, unknown> = {}) {
    return {
        data: [] as string[], isLoading: false, isError: false,
        refetch: refetchIdsMock, ...overrides,
    };
}

function toggleResult(overrides: Record<string, unknown> = {}) {
    return {
        isPending: false, variables: undefined as { venueId: string } | undefined,
        mutate: mutateMock, ...overrides,
    };
}

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

beforeEach(() => {
    vi.clearAllMocks();
    useVenuesMock.mockReset().mockImplementation(() => ({
        data: [...VENUES], isLoading: false, error: null, refetch: vi.fn(),
    }));
    useVenueFavoriteIdsMock.mockReset().mockImplementation(() => idsResult({ data: ['v-1'] }));
    useVenueFavoriteToggleMock.mockReset().mockImplementation(() => toggleResult());
    useSearchSuggestionsMock.mockReset().mockImplementation(() => ({
        suggestions: [], open: false, listRef: { current: null },
        handleFocus: vi.fn(), handleBlur: vi.fn(), dismiss: vi.fn(), isLoading: false,
    }));
});

function activateFavoritesPill() {
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
}

describe('Clubs page — favorites ids error state (run #110)', () => {
    it('FAV-1: ids ERROR + Favorites pill → list stays visible, error strip renders, NEVER the onboarding empty state', () => {
        useVenueFavoriteIdsMock.mockImplementation(() =>
            idsResult({ data: undefined, isError: true, error: { status: 500, message: 'boom' } }));
        renderPage();
        activateFavoritesPill();

        // Fail-open: both venues remain visible despite the unknown fav state.
        expect(screen.getByText('Al-Nakheel Sports Complex')).toBeInTheDocument();
        expect(screen.getByText('Olaya Padel Hub')).toBeInTheDocument();
        // Honest error strip with retry.
        const strip = screen.getAllByRole('status').find((el) =>
            el.textContent?.includes("Couldn't load your favorites."),
        );
        expect(strip).toBeDefined();
        expect(screen.getByText("Couldn't load your favorites.")).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
        // The false-empty onboarding copy must not render.
        expect(screen.queryByText('No favorites yet')).not.toBeInTheDocument();
    });

    it('FAV-2: Retry on the error strip re-fires the ids query', () => {
        useVenueFavoriteIdsMock.mockImplementation(() =>
            idsResult({ data: undefined, isError: true, error: { status: 0, message: 'offline' } }));
        renderPage();
        activateFavoritesPill();

        fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
        expect(refetchIdsMock).toHaveBeenCalledTimes(1);
    });

    it('FAV-3: healthy ids → Favorites narrows to saved venues only, no error strip', () => {
        renderPage();
        activateFavoritesPill();

        expect(screen.getByText('Al-Nakheel Sports Complex')).toBeInTheDocument();
        expect(screen.queryByText('Olaya Padel Hub')).not.toBeInTheDocument();
        expect(screen.queryByText("Couldn't load your favorites.")).not.toBeInTheDocument();
    });

    it('FAV-4: per-heart pending — toggling venue A leaves venue B heart enabled', () => {
        useVenueFavoriteToggleMock.mockImplementation(() =>
            toggleResult({ isPending: true, variables: { venueId: 'v-1' } }));
        renderPage();
        activateFavoritesPill();

        // Only v-1 visible under the pill; its heart disabled mid-toggle.
        const heartA = screen.getByRole('button', { name: 'Remove from favorites' });
        expect(heartA).toBeDisabled();

        // B's heart would be enabled if it were rendered — assert via the
        // nearby-list case: switch to Nearby (all venues visible).
        fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
        const heartB = screen.getByRole('button', { name: 'Add to favorites' });
        expect(heartB).toBeEnabled();
    });

    it('FAV-5 (PR-Agent run #110): ids ERROR → hearts inert (no mislabeled unfavorite)', () => {
        useVenueFavoriteIdsMock.mockImplementation(() =>
            idsResult({ data: undefined, isError: true, error: { status: 500, message: 'boom' } }));
        renderPage();
        // Nearby list (all venues) — hearts render unknown-state and must be
        // disabled until Retry succeeds.
        fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));

        const hearts = screen.getAllByRole('button', { name: 'Add to favorites' });
        expect(hearts.length).toBeGreaterThan(0);
        hearts.forEach((h) => expect(h).toBeDisabled());
    });
});
