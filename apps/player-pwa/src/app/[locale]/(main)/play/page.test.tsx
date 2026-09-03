import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

/**
 * Play page header tests (Abdullah, 2026-09-03 redesign):
 * - the labeled "+ Host a Match" pill replaces the bare "+" icon;
 * - search + calendar + filter bar live in ONE sticky group that pins while
 *   scrolling the games list (IntersectionObserver sentinel drives isPinned).
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
});
