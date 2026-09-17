/**
 * Integration — the login flow's channel + drafts SURVIVE a full remount
 * (what a reload or a verify round-trip produces in Next.js App Router).
 *
 * Incident 2026-09-11: user toggled to email, typed their address, went to
 * the verify screen, came back — landed on PHONE mode with an empty form.
 * After the fix, sessionStorage restores mode + drafts on remount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import LoginPage from '@/app/[locale]/(auth)/login/page';

const pushMock = vi.fn();
const backMock = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: backMock }),
    usePathname: () => '/en/login',
    useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/hooks/useAuth', () => ({
    useSendOtp: () => ({ mutate: vi.fn(), isPending: false }),
    useSendEmailOtp: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/auth/DevLoginBar', () => ({ default: () => null }));

function renderLogin() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                <LoginPage />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

/** Simulate a remount: unmount the current tree, render a fresh one. */
function remount(view: ReturnType<typeof renderLogin>) {
    view.unmount();
    return renderLogin();
}

describe('login flow state survives remount', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Drafts moved to localStorage (2026-09-17 — must survive iOS tab
        // discard). Both storages cleared for test isolation.
        localStorage.clear();
        sessionStorage.clear();
    });

    it('email typed + remount → email input restored WITH the typed address', () => {
        let view = renderLogin();
        // Switch to email channel via the segmented selector (design A) and
        // type a (wrong) address — the exact incident scenario before heading
        // to verify and coming back.
        fireEvent.click(screen.getByRole('button', { name: 'Email' }));
        const input = screen.getByPlaceholderText('Email address') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'wrong@typo.com' } });

        // "Reload": full unmount + fresh mount.
        view = remount(view);

        // Email segment still active + the typed address restored.
        expect(screen.getByRole('button', { name: 'Email' })).toHaveAttribute('aria-pressed', 'true');
        expect((screen.getByPlaceholderText('Email address') as HTMLInputElement).value).toBe('wrong@typo.com');
    });

    it('phone typed + remount → phone restored', () => {
        const view = renderLogin();
        const input = screen.getByPlaceholderText('5X XXX XXXX') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '501234567' } });

        remount(view);

        expect((screen.getByPlaceholderText('5X XXX XXXX') as HTMLInputElement).value).toBe('501234567');
    });

    it('empty session → phone mode, empty form (fresh visitor unchanged)', () => {
        renderLogin();
        expect(screen.getByPlaceholderText('5X XXX XXXX')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Email address')).toBeNull();
    });
});
