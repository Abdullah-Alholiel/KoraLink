/**
 * Regression tests — language switching (2026-09-11 + 2026-09-17).
 *
 * v1: header was a dead-end back arrow → replaced with a toggle.
 * v2: the toggle changed the URL but NEXT_LOCALE was never persisted → the
 *     middleware snapped the UI back to the first-detected locale.
 * v3 (2026-09-17): the bare globe icon (tap = instant flip) became a
 *     segmented ع/EN pill — the current language is VISIBLE and pressed,
 *     tapping the other segment switches. Same component now serves the
 *     login header AND the profile language row.
 *
 * Guards here (integration-style — the REAL locale-routing module runs):
 *  1. Segmented toggle renders on /en/login with EN pressed, ع inactive.
 *  2. Clicking ع on /en/login → navigates to /ar/login AND persists
 *     NEXT_LOCALE=ar.
 *  3. Arabic leg: /ar/login shows ع pressed; clicking EN → /en/login +
 *     NEXT_LOCALE=en (localized group aria-label parity guard).
 *  4. Clicking the ALREADY-ACTIVE segment must NOT navigate (a toggle,
 *     not a flip-flop reload).
 *  5. The old globe icon is gone from the login header.
 *  6. Content block stays click-transparent (dead-tap incident 2026-09-11).
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

describe('login header language toggle (segmented ع/EN)', () => {
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

    it('renders the segmented toggle with EN pressed on /en/login', () => {
        renderPage('en');
        const group = screen.getByRole('group', { name: 'Change language' });
        expect(group).toHaveAttribute('data-testid', 'language-toggle');
        // Segments carry endonym aria-labels ('English'/'العربية') — those ARE
        // their accessible names; the visible 'ع'/'EN' glyphs are decorative.
        expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'العربية' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('clicking ع on /en/login → /ar/login AND persists NEXT_LOCALE=ar', () => {
        renderPage('en');
        fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
        expect(assignMock).toHaveBeenCalledTimes(1);
        expect(assignMock).toHaveBeenCalledWith('/ar/login');
        expect(document.cookie).toContain('NEXT_LOCALE=ar');
        expect(backMock).not.toHaveBeenCalled();
    });

    it('Arabic leg: ع pressed on /ar/login; clicking EN → /en/login + NEXT_LOCALE=en', () => {
        mockPathname = '/ar/login';
        renderPage('ar');
        expect(screen.getByRole('button', { name: 'العربية' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(screen.getByRole('button', { name: 'English' }));
        expect(assignMock).toHaveBeenCalledWith('/en/login');
        expect(document.cookie).toContain('NEXT_LOCALE=en');
        // Localized group aria-label parity (ar.json).
        expect(screen.getByRole('group', { name: 'تغيير اللغة' })).toBeInTheDocument();
    });

    it('clicking the ALREADY-ACTIVE segment does not navigate (toggle, not flip-flop)', () => {
        renderPage('en');
        fireEvent.click(screen.getByRole('button', { name: 'English' }));
        expect(assignMock).not.toHaveBeenCalled();
    });

    it('the old globe icon is gone from the login header', () => {
        const { container } = renderPage('en');
        expect(container.querySelector('.lucide-globe')).toBeNull();
        expect(container.querySelector('.lucide-arrow-left')).toBeNull();
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
