/**
 * Regression test — login header language toggle (2026-09-11).
 *
 * The login screen is the entry point of the auth flow, so the top-right
 * back arrow had nothing to go back to (router.back() on a fresh entry is
 * a no-op / exits the PWA). Abdullah: replace it with a language toggle.
 *
 * Guards:
 *  1. The header button is a Globe language toggle (no ArrowLeft anywhere).
 *  2. Clicking it navigates to the SAME path with the locale prefix flipped,
 *     via a FULL location reload (mirrors the profile screen's toggle —
 *     router.push may reuse cached RSC with stale i18n messages).
 *  3. router.back() is never wired to the header button.
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

    it('flips /en → /ar via a full location assign on click', () => {
        renderPage('en');
        fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
        expect(assignMock).toHaveBeenCalledTimes(1);
        expect(assignMock).toHaveBeenCalledWith('/ar/login');
        expect(backMock).not.toHaveBeenCalled();
    });

    it('flips /ar → /en (Arabic-first entry)', () => {
        mockPathname = '/ar/login';
        renderPage('ar');
        // Arabic aria-label resolves from ar.json — key parity guard too.
        fireEvent.click(screen.getByRole('button', { name: 'تغيير اللغة' }));
        expect(assignMock).toHaveBeenCalledWith('/en/login');
    });
});
