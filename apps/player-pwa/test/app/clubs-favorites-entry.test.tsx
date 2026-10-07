import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

/**
 * P2-165: favorites entry points (run #111).
 *
 * Contract under test (docs/plans/run111-favorites-entry-and-toctou/):
 *   FAV-11 `?tab=favorites` deep-link activates the Favorites filter on
 *          first paint (profile "My favorite clubs" row → /clubs?tab=favorites).
 *   FAV-12 No/unknown param → default Nearby tab (no behavioral change for
 *          the plain /clubs entry).
 *   FAV-13 Hydrated GUEST on the Favorites tab → sign-in prompt + CTA linking
 *          to /{locale}/login INSTEAD of the false "No favorites yet" copy.
 *   FAV-14 Signed-in user with favorites on the deep-link → real narrowing,
 *          no sign-in CTA.
 *   FAV-15 Profile menu row exists (structure pin: href with ?tab=favorites).
 *
 * Same mock family as clubs-favorites-error.test.tsx (page-level, no network).
 */

const pushMock = vi.hoisted(() => vi.fn());
const useVenuesMock = vi.hoisted(() => vi.fn());
const useVenueFavoriteIdsMock = vi.hoisted(() => vi.fn());
const useVenueFavoriteToggleMock = vi.hoisted(() => vi.fn());
const useSearchSuggestionsMock = vi.hoisted(() => vi.fn());
// Mutable param bag the useSearchParams mock reads — per-test deep-links.
const searchParamsState = vi.hoisted(() => ({ tab: null as string | null }));
// Mutable store state — per-test auth.
const useAppStoreMockState = vi.hoisted(() =>
    ({ isHydrated: true }) as Record<string, unknown>,
);

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/clubs',
    useSearchParams: () => ({ get: (k: string) => (k === 'tab' ? searchParamsState.tab : null) }),
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/useVenues', () => ({ useVenues: useVenuesMock }));
vi.mock('@/hooks/useVenueFavorites', () => ({
    useVenueFavoriteIds: useVenueFavoriteIdsMock,
    useVenueFavoriteToggle: useVenueFavoriteToggleMock,
}));
vi.mock('@/hooks/useSearchSuggestions', () => ({ useSearchSuggestions: useSearchSuggestionsMock }));
vi.mock('@/providers/LocationProvider', () => ({
    useLocation: () => ({ coords: null, request: vi.fn(), loading: false }),
}));
vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }));
vi.mock('@/store/useAppStore', () => ({
    useAppStore: (sel: (s: Record<string, unknown>) => unknown) => sel(useAppStoreMockState),
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

function idsResult(overrides: Record<string, unknown> = {}) {
    return {
        data: [] as string[], isLoading: false, isError: false,
        refetch: vi.fn(), ...overrides,
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
    searchParamsState.tab = null;
    useAppStoreMockState.isHydrated = true;
    useAppStoreMockState.user = { id: 'u-1', full_name: 'Tester' };
    useVenuesMock.mockReset().mockImplementation(() => ({
        data: [...VENUES], isLoading: false, error: null, refetch: vi.fn(),
    }));
    useVenueFavoriteIdsMock.mockReset().mockImplementation(() => idsResult({ data: ['v-1'] }));
    useVenueFavoriteToggleMock.mockReset().mockImplementation(() => ({
        isPending: false, variables: undefined, mutate: vi.fn(),
    }));
    useSearchSuggestionsMock.mockReset().mockImplementation(() => ({
        suggestions: [], open: false, listRef: { current: null },
        handleFocus: vi.fn(), handleBlur: vi.fn(), dismiss: vi.fn(), isLoading: false,
    }));
});

describe('Clubs page — favorites entry points (P2-165, run #111)', () => {
    it('FAV-11: ?tab=favorites deep-link activates the Favorites filter on first paint', () => {
        searchParamsState.tab = 'favorites';
        renderPage();

        // Favorites is active WITHOUT any pill click (first paint), narrowing
        // to the saved venue v-1 only.
        expect(screen.getByText('Al-Nakheel Sports Complex')).toBeInTheDocument();
        expect(screen.queryByText('Olaya Padel Hub')).not.toBeInTheDocument();
    });

    it('FAV-12: no param → default Nearby list (plain /clubs behavior unchanged)', () => {
        renderPage();

        expect(screen.getByText('Al-Nakheel Sports Complex')).toBeInTheDocument();
        expect(screen.getByText('Olaya Padel Hub')).toBeInTheDocument();
        // No sign-in CTA on the default tab.
        expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    });

    it('FAV-13: hydrated GUEST + ?tab=favorites → sign-in prompt + CTA, NOT the false-empty copy', () => {
        searchParamsState.tab = 'favorites';
        useAppStoreMockState.user = null;
        useVenueFavoriteIdsMock.mockImplementation(() => idsResult({ data: undefined }));
        renderPage();

        // The dead-end copy must not render for a guest with no data.
        expect(screen.queryByText('No favorites yet')).not.toBeInTheDocument();
        // The prompt + CTA render instead.
        expect(screen.getByText('Sign in to save your favorite clubs')).toBeInTheDocument();
        const cta = screen.getByRole('link', { name: 'Sign in' });
        expect(cta).toHaveAttribute('href', '/en/login');
    });

    it('FAV-14: signed-in user on the deep-link → real narrowing, NO sign-in CTA', () => {
        searchParamsState.tab = 'favorites';
        renderPage();

        expect(screen.getByText('Al-Nakheel Sports Complex')).toBeInTheDocument();
        expect(screen.queryByText('Sign in to save your favorite clubs')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    });

    it('FAV-15: profile menu row deep-links to the favorites tab (structure pin)', async () => {
        const fs = await import('node:fs');
        const src = fs.readFileSync(
            'src/app/[locale]/(main)/profile/page.tsx', 'utf8',
        );
        expect(src).toContain('profile.myFavorites');
        expect(src).toContain('/clubs?tab=favorites');
        // i18n parity pin — the key exists in BOTH locale bundles.
        const ar = JSON.parse(
            fs.readFileSync('src/messages/ar.json', 'utf8'),
        ) as { profile: Record<string, string>; clubs: Record<string, string> };
        expect(ar.profile.myFavorites).toBeTruthy();
        expect(ar.clubs.favoritesSignInTitle).toBeTruthy();
        expect(ar.clubs.favoritesSignInCta).toBeTruthy();
    });

    it('FAV-16 (PR-Agent r3 refutation pin): pre-hydration guest on ?tab=favorites → fail-open LIST, no false-empty, no premature CTA', () => {
        // PR-Agent r3 claimed the dead-end copy flashes pre-hydration. The
        // r6 fail-open must prevent ANY empty-state render while venues are
        // listed — this pin holds that contract for the guest variant.
        searchParamsState.tab = 'favorites';
        useAppStoreMockState.isHydrated = false;
        useAppStoreMockState.user = null;
        useVenueFavoriteIdsMock.mockImplementation(() => idsResult({ data: undefined }));
        renderPage();

        // Fail-open: the venue list renders (no empty state at all).
        expect(screen.getByText('Al-Nakheel Sports Complex')).toBeInTheDocument();
        expect(screen.queryByText('No favorites yet')).not.toBeInTheDocument();
        // Auth unknown pre-hydration: neither sign-in copy nor CTA yet.
        expect(screen.queryByText('Sign in to save your favorite clubs')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    });
});
