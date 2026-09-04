/**
 * My Games page — scroll standardization guard (2026-09-04).
 *
 * Abdullah: "on the desktop my games does not scroll". Root cause: the page
 * wrapped its content in a nested `overflow-y-auto scroll-container` div with
 * no height constraint — it never scrolled itself, but `overscroll-behavior:
 * contain` blocked wheel/touch scroll chaining to the real scroller
 * (ScrollableMain's <main>). These tests lock in the single-scroller
 * standard: the page must render NO nested scroll container of its own.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/my-games',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/useUser', () => ({
    useMyMatches: () => ({
        data: [], isLoading: false, error: null, refetch: vi.fn(),
    }),
}));

import MyGamesPage from './page';

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                <MyGamesPage />
            </NextIntlClientProvider>
        </QueryClientProvider>
    );
}

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
