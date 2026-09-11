/**
 * Regression tests — login header language toggle (2026-09-11 incident).
 *
 * Incident v1: header was a dead-end back arrow → replaced with a toggle.
 * Incident v2 (real-device report): the toggle changed the URL but the app
 * snapped back to Arabic — the NEXT_LOCALE cookie (read by the middleware on
 * every UNPREFIXED navigation: PWA relaunch to start_url, the fetcher 401
 * bounce, cold deep links) was never written by any code path, so it stayed
 * at the visitor's first-detected locale forever.
 *
 * Guards here (integration-style — the REAL locale-routing module runs):
 *  1. Globe renders; no back arrow anywhere on the login header.
 *  2. /en/login click → navigates to /ar/login AND persists NEXT_LOCALE=ar.
 *  3. /ar/login click → navigates to /en/login AND persists NEXT_LOCALE=en
 *     (Arabic aria-label parity guard for ar.json).
 *  4. router.back() is never wired to the header button.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import LoginPage from '@/app/[locale]/(auth)/login/page';

let mockPathname = '/en/login';
const backMock = vi.fn();
const assignMock = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: backMock }),
    usePathname: () => mockPathname,
    useSearchParams: () => new URLSearchParams(''),
}));

// DevLoginBar depends on NEXT_PUBLIC_* env baking — irrelevant here.
vi.mock('@/components/auth/DevLoginBar', () => ({ default: () => null }));

function renderPage(locale: 'en' | 'ar') {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider
                messages={locale === 'ar' ? arMessages : enMessages}
                locale={locale}
            >
                <LoginPage />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

describe('login header language toggle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPathname = '/en/login';
        document.cookie = 'NEXT_LOCALE=; max-age=0; path=/';
        localStorage.removeItem('koralink_locale');
        Object.defineProperty(window, 'location', {
            writable: true,
            value: { ...window.location, assign: assignMock, href: 'http://localhost/en/login' },
        });
    });

    it('renders a Globe toggle and no back arrow', () => {
        const { container } = renderPage('en');
        expect(screen.getByRole('button', { name: 'Change language' })).toBeInTheDocument();
        expect(container.querySelector('.lucide-globe')).not.toBeNull();
        expect(container.querySelector('.lucide-arrow-left')).toBeNull();
    });

    it('/en/login click → navigates to /ar/login AND persists NEXT_LOCALE=ar', () => {
        renderPage('en');
        fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
        expect(assignMock).toHaveBeenCalledTimes(1);
        expect(assignMock).toHaveBeenCalledWith('/ar/login');
        expect(document.cookie).toContain('NEXT_LOCALE=ar');
        expect(backMock).not.toHaveBeenCalled();
    });

    it('/ar/login click → /en/login + NEXT_LOCALE=en (Arabic aria-label parity)', () => {
        mockPathname = '/ar/login';
        renderPage('ar');
        fireEvent.click(screen.getByRole('button', { name: 'تغيير اللغة' }));
        expect(assignMock).toHaveBeenCalledWith('/en/login');
        expect(document.cookie).toContain('NEXT_LOCALE=en');
    });

    it('content block is click-transparent (its -mt-16 overlaps the header row)', () => {
        // Dead-tap incident 2026-09-11: the centered content block slid up over
        // the header and intercepted every header-button tap. Guard the fix:
        const { container } = renderPage('en');
        const block = container.querySelector('.-mt-16');
        expect(block).not.toBeNull();
        expect(block?.className).toContain('pointer-events-none');
        // Interactive descendants re-enable hit-testing via arbitrary variants
        // on the block itself (inputs, buttons, links).
        expect(block?.className).toContain('[&_input]:pointer-events-auto');
        expect(block?.className).toContain('[&_button]:pointer-events-auto');
        expect(block?.className).toContain('[&_a]:pointer-events-auto');
        // The phone input must not carry its own pointer-events suppression.
        const input = block?.querySelector('input');
        expect(input).not.toBeNull();
        expect(input?.className).not.toContain('pointer-events-none');
        // The continue CTA (in the bottom section) stays a real button.
        const continueCtas = screen.getAllByRole('button', { name: /Continue/ });
        expect(continueCtas.length).toBeGreaterThanOrEqual(1);
    });
});
