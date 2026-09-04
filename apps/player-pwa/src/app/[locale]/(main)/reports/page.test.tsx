/**
 * Reports page — scroll standardization guard (2026-09-04).
 *
 * Same nested-scroller defect and fix as my-games: a `overflow-y-auto
 * scroll-container` wrapper with no height blocked scroll chaining to
 * ScrollableMain. Tests lock in the single-scroller standard.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/reports',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/useReports', () => ({
    useMyReports: () => ({
        reports: [], isLoading: false, error: null, refetch: vi.fn(),
        hasMore: false, fetchNextPage: vi.fn(), isFetchingNextPage: false,
    }),
}));

import ReportsPage from './page';

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                <ReportsPage />
            </NextIntlClientProvider>
        </QueryClientProvider>
    );
}

describe('Reports page — single-scroller standard', () => {
    it('renders NO nested scroll container — <main> (ScrollableMain) is the only scroller', () => {
        const { container } = renderPage();
        expect(container.querySelectorAll('.scroll-container')).toHaveLength(0);
        expect(container.querySelector('[class*="overflow-y-auto"]')).toBeNull();
    });

    it('keeps the flex fill chain: root is flex-col flex-1 min-h-0', () => {
        const { container } = renderPage();
        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toContain('flex-col');
        expect(root.className).toContain('flex-1');
        expect(root.className).toContain('min-h-0');
    });

    it('still renders the empty state', () => {
        renderPage();
        expect(screen.getByText('No reports')).toBeInTheDocument();
        expect(
            screen.getByText(
                'You have not reported anything. Report a player, match, or venue if something breaks the rules.'
            )
        ).toBeInTheDocument();
    });
});
