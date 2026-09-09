import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

/**
 * Play page header tests (Abdullah, 2026-09-03 redesign; compact pill
 * 2026-09-09): the "+ Host a Match" pill next to search is COMPACT —
 * single-line label, no hint line — and search + calendar + filter bar
 * live in ONE sticky group that pins while scrolling the games list
 * (IntersectionObserver sentinel drives isPinned).
 *
 * The page pulls useMatches/useLocation; both are mocked (no network/socket).
 */

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/play',
    useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn() }),
}));

vi.mock('@/hooks/useMatches', () => ({
    useMatches: () => ({
        matches: [], isLoading: false, error: null, refetch: vi.fn(),
        hasMore: false, fetchNextPage: vi.fn(), isFetchingNextPage: false,
    }),
}));

vi.mock('@/providers/LocationProvider', () => ({
    useLocation: () => ({ coords: null, request: vi.fn(), loading: false }),
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
