/**
 * Regression tests — 2026-11-16 owner P0: phone login when SMS is unavailable.
 *
 * Prod-like env with an empty UNIFONIC_APP_SID used to return 200 and log the
 * code; now the API returns 503 { code: 'SMS_UNAVAILABLE' }. The login screen
 * must show a SPECIFIC, LOCALIZED message (not the generic "couldn't send")
 * and offer a ONE-TAP switch to the email channel.
 *
 * Guards here:
 *  1. 503 + SMS_UNAVAILABLE → errors.smsUnavailable copy + the switch button.
 *  2. Tapping the switch moves the channel selector to Email (persisted via
 *     setAuthChannel) and swaps the input — the user continues by email.
 *  3. A bare 503 without the code still shows the GENERIC send-failure copy
 *     (no switch button) — the specific path keys on the machine code.
 *  4. EN + AR parity: both locales resolve their authored copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import LoginPage from '@/app/[locale]/(auth)/login/page';
import { FetchError } from '@/lib/fetcher';

const pushMock = vi.fn();
const pathnameMock = vi.fn(() => '/en/login');

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
    usePathname: () => pathnameMock(),
    useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/fetcher', async () => {
    const actual = await vi.importActual<typeof import('@/lib/fetcher')>('@/lib/fetcher');
    return {
        ...actual,
        fetcher: vi.fn(),
    };
});

vi.mock('@/components/auth/DevLoginBar', () => ({ default: () => null }));

import { fetcher } from '@/lib/fetcher';
const fetcherMock = vi.mocked(fetcher);

function renderPage(locale: 'en' | 'ar') {
    pathnameMock.mockReturnValue(`/${locale}/login`);
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

/** The phone placeholder is the same literal in both locales; the Continue
 *  button name is localized. */
function fillPhoneAndContinue(locale: 'en' | 'ar') {
    const input = screen.getByPlaceholderText('5X XXX XXXX') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '501234567' } });
    const continueName =
        locale === 'ar' ? (arMessages.login.continue as string) : (enMessages.login.continue as string);
    fireEvent.click(screen.getByRole('button', { name: continueName }));
}

beforeEach(() => {
    vi.clearAllMocks();
    // Kill any unconsumed once-rejections from a prior test — a failed earlier
    // test must never poison the next one's mock queue (hit in this suite).
    fetcherMock.mockReset();
    pathnameMock.mockReturnValue('/en/login');
    localStorage.clear();
});

describe('login — SMS_UNAVAILABLE (2026-11-16 P0)', () => {
    it('shows the specific localized message + the one-tap email switch (EN)', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError(
                'SMS login is not available right now.',
                503,
                'http://api.test/auth/send-otp',
                'SMS_UNAVAILABLE',
            ),
        );
        renderPage('en');
        fillPhoneAndContinue('en');

        const expected = enMessages.errors.smsUnavailable as string;
        const message = await screen.findByText(expected);
        expect(message).toBeInTheDocument();
        expect(screen.getByTestId('switch-to-email')).toBeInTheDocument();
        expect(pushMock).not.toHaveBeenCalled(); // no navigation — the user stays
    });

    it('shows the specific localized message + the one-tap email switch (AR)', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError(
                'SMS login is not available right now.',
                503,
                'http://api.test/auth/send-otp',
                'SMS_UNAVAILABLE',
            ),
        );
        renderPage('ar');
        fillPhoneAndContinue('ar');

        const expected = arMessages.errors.smsUnavailable as string;
        expect(await screen.findByText(expected)).toBeInTheDocument();
        expect(screen.getByTestId('switch-to-email')).toBeInTheDocument();
    });

    it('tapping the switch moves the channel selector to EMAIL and swaps the input', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError(
                'SMS login is not available right now.',
                503,
                'http://api.test/auth/send-otp',
                'SMS_UNAVAILABLE',
            ),
        );
        renderPage('en');
        fillPhoneAndContinue('en');
        await screen.findByTestId('switch-to-email');

        fireEvent.click(screen.getByTestId('switch-to-email'));

        // The switch button is gone (error cleared) and the Email segment is
        // now the pressed one.
        expect(screen.queryByTestId('switch-to-email')).toBeNull();
        const emailSegment = screen.getByRole('button', { name: 'Email' });
        expect(emailSegment.getAttribute('aria-pressed')).toBe('true');
        // The email input is rendered (phone input swapped out).
        expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
        // The channel choice persists (setAuthChannel → localStorage).
        expect(localStorage.getItem('koralink_auth_channel')).toBe('email');
    });

    it('a bare 503 WITHOUT the machine code keeps the GENERIC copy (no switch)', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError('Request failed with status 503', 503, 'http://api.test/auth/send-otp'),
        );
        renderPage('en');
        fillPhoneAndContinue('en');

        const generic = enMessages.errors.otpSendFailed as string;
        expect(await screen.findByText(generic)).toBeInTheDocument();
        expect(screen.queryByTestId('switch-to-email')).toBeNull();
    });
});
