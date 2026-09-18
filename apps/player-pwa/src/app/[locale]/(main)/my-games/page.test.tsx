/**
 * My Games page tests.
 *
 * 1. Single-scroller standard guard (2026-09-04) — Abdullah: "on the desktop
 *    my games does not scroll". Root cause: a nested `overflow-y-auto
 *    scroll-container` div with no height constraint never scrolled itself,
 *    but `overscroll-behavior: contain` blocked wheel/touch scroll chaining
 *    to the real scroller (ScrollableMain's <main>). These tests lock in the
 *    single-scroller standard: the page must render NO nested scroll
 *    container of its own.
 *
 * 2. Tailored tags + stats strip (2026-09-18) — Abdullah: My Games cards must
 *    carry tailored tags (hosted-by-me / cancelled) and a stats strip after
 *    the Active section. Stats are the SERVER-truth numbers from
 *    /users/me/stats (same family as the profile hero), NOT client-side
 *    counts of the 50-row my-matches page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import type { NearbyMatchApi } from '@/lib/api-adapter';

const navState = { pathname: '/en/my-games' };

vi.mock('next/navigation', () => ({
    usePathname: () => navState.pathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const useUserState = {
    matches: [] as NearbyMatchApi[],
    matchesLoading: false,
    matchesError: null as unknown,
    stats: null as
        | { games_played: number; potm_count: number; matches_hosted: number; karma_score: number; no_show_count: number }
        | null,
    statsLoading: false,
    statsError: null as unknown,
};

vi.mock('@/hooks/useUser', () => ({
    useMyMatches: () => ({
        data: useUserState.matches,
        isLoading: useUserState.matchesLoading,
        error: useUserState.matchesError,
        refetch: vi.fn(),
    }),
    useUserStats: () => ({
        data: useUserState.stats,
        isLoading: useUserState.statsLoading,
        error: useUserState.statsError,
        refetch: vi.fn(),
    }),
}));

const mockStore = { user: { id: 'user-me' } };

vi.mock('@/store/useAppStore', () => ({
    // Full module surface (§3 pitfall): pages can call the hook form with a
    // selector AND the module-level getState().
    useAppStore: Object.assign(
        vi.fn((selector?: (s: typeof mockStore) => unknown) =>
            selector ? selector(mockStore) : mockStore,
        ),
        { getState: () => mockStore },
    ),
    selectUser: (s: typeof mockStore) => s.user,
}));

import MyGamesPage from './page';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function fixture(overrides: Partial<NearbyMatchApi> = {}): NearbyMatchApi {
    return {
        id: 'm-1',
        title: 'Friday Night 7v7',
        match_type: 'Casual',
        gender_rule: 'Men Only',
        status: 'Open',
        scheduled_at: new Date(Date.now() + 2 * DAY).toISOString(),
        duration_mins: 90,
        price_per_player: 40,
        max_players: 10,
        spots_filled: 4,
        distance_m: null,
        host_id: 'someone-else',
        host_name: 'Other Host',
        host_avatar: null,
        pitch_id: 'p-1',
        pitch_name: 'Pitch A',
        pitch_size: '7v7',
        pitch_surface: 'Grass',
        venue_name: 'Riyadh Arena',
        venue_city: 'Riyadh',
        is_joined: true,
        visibility: 'public',
        has_voted: false,
        booking_mode: 'koralink',
        is_player_hosted: false,
        host_payout_state: 'not_applicable',
        ...overrides,
    };
}

// ── Render helper ───────────────────────────────────────────────────────────

function renderPage(locale: 'en' | 'ar' = 'en') {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider
                messages={locale === 'ar' ? arMessages : enMessages}
                locale={locale}
            >
                <MyGamesPage />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    navState.pathname = '/en/my-games';
    useUserState.matches = [];
    useUserState.matchesLoading = false;
    useUserState.matchesError = null;
    useUserState.stats = null;
    useUserState.statsLoading = false;
    useUserState.statsError = null;
});

// ── 1. Single-scroller standard ─────────────────────────────────────────────

describe('My Games page — single-scroller standard', () => {
    it('renders NO nested scroll container — <main> (ScrollableMain) is the only scroller', () => {
        const { container } = renderPage();
        // No .scroll-container descendants (the layout's <main> is outside this tree)
        expect(container.querySelectorAll('.scroll-container')).toHaveLength(0);
        // No overflow-y-auto wrapper either (the actual bug: contained wheel events)
        expect(container.querySelector('[class*="overflow-y-auto"]')).toBeNull();
    });

    it('keeps the flex fill chain: root is flex-col flex-1 min-h-0', () => {
        const { container } = renderPage();
        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toContain('flex-col');
        expect(root.className).toContain('flex-1');
        expect(root.className).toContain('min-h-0');
    });

    it('still renders the Active section and empty state with the standard content wrapper', () => {
        renderPage();
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('You have no active matches')).toBeInTheDocument();
        // Both empty states (Active-empty + fully-empty) render a "Find a match" CTA
        const ctas = screen.getAllByRole('link', { name: 'Find a match' });
        expect(ctas.length).toBe(2);
        for (const cta of ctas) {
            expect(cta).toHaveAttribute('href', '/en/play');
        }
    });
});

// ── 2. Tailored tags (host + cancelled) ─────────────────────────────────────

describe('My Games page — tailored tags', () => {
    it('shows the hosted tag on my active hosted match and the cancelled tag + count in History', async () => {
        useUserState.matches = [
            fixture({ id: 'm-hosted', title: 'My Hosted Game', host_id: 'user-me' }),
            fixture({
                id: 'm-cancelled',
                title: 'Cancelled Thursday Game',
                status: 'Cancelled',
                scheduled_at: new Date(Date.now() - 3 * DAY).toISOString(),
                voting_closes_at: new Date(Date.now() - 2 * DAY).toISOString(),
            }),
        ];
        renderPage();

        // Cancelled goes to History; the red count caption sits next to the heading.
        await waitFor(() => {
            expect(screen.getByTestId('history-cancelled-count')).toHaveTextContent(
                '1 cancelled',
            );
        });
        // Cancelled tag (red X pill) renders on the cancelled card.
        expect(screen.getAllByTestId('match-card-cancelled-tag')).toHaveLength(1);
        expect(screen.getByText('Match Cancelled')).toBeInTheDocument();
        // Host tag renders on MY hosted match.
        expect(screen.getAllByTestId('match-card-host-tag')).toHaveLength(1);
        expect(screen.getByText('My Hosted Game')).toBeInTheDocument();
    });

    it('does NOT show the host tag on matches I joined but do not host', () => {
        useUserState.matches = [fixture({ id: 'm-joined', host_id: 'someone-else' })];
        renderPage();
        expect(screen.queryByTestId('match-card-host-tag')).toBeNull();
        expect(screen.queryByTestId('match-card-cancelled-tag')).toBeNull();
    });

    it('does NOT render the cancelled count caption when history has no cancelled games', () => {
        useUserState.matches = [
            fixture({
                id: 'm-done',
                status: 'Completed',
                scheduled_at: new Date(Date.now() - 30 * DAY).toISOString(),
                voting_closes_at: new Date(Date.now() - 29 * DAY).toISOString(),
            }),
        ];
        renderPage();
        expect(screen.queryByTestId('history-cancelled-count')).toBeNull();
    });
});

// ── 3. Stats strip (after Active) ───────────────────────────────────────────

describe('My Games page — stats strip', () => {
    it('renders Played / Wins / Hosted from the server stats payload', () => {
        useUserState.stats = {
            games_played: 12,
            potm_count: 3,
            matches_hosted: 5,
            karma_score: 88,
            no_show_count: 0,
        };
        renderPage();
        const strip = screen.getByTestId('my-games-stats');
        expect(strip).toHaveTextContent('12');
        expect(strip).toHaveTextContent('3');
        expect(strip).toHaveTextContent('5');
        expect(strip).toHaveTextContent('Played');
        expect(strip).toHaveTextContent('Wins');
        expect(strip).toHaveTextContent('Hosted');
    });

    it('renders a skeleton while stats load', () => {
        useUserState.statsLoading = true;
        renderPage();
        const strip = screen.getByTestId('my-games-stats');
        expect(strip.querySelector('.animate-pulse')).not.toBeNull();
        expect(strip.textContent).not.toContain('Played');
    });

    it('renders nothing in the strip when the stats read fails (never blocks the list)', () => {
        useUserState.statsError = new Error('stats down');
        useUserState.matches = [fixture({ id: 'm-1' })];
        const { getByTestId, getByText } = renderPage();
        const strip = getByTestId('my-games-stats');
        expect(strip.textContent).toBe('');
        // The games list still renders.
        expect(getByText('Friday Night 7v7')).toBeInTheDocument();
    });

    it('localizes labels in Arabic (يُعرض بالعربية)', () => {
        navState.pathname = '/ar/my-games';
        useUserState.stats = {
            games_played: 12,
            potm_count: 3,
            matches_hosted: 5,
            karma_score: 88,
            no_show_count: 0,
        };
        renderPage('ar');
        const strip = screen.getByTestId('my-games-stats');
        expect(strip).toHaveTextContent('لُعبت');
        expect(strip).toHaveTextContent('فوز');
        expect(strip).toHaveTextContent('استضافتها');
    });
});
