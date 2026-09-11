/**
 * Regression tests — email/phone OTP verify screen (2026-09-10 401/429 incident).
 *
 * Incident: user requested a fresh code (server overwrites the stored code),
 * submitted the STALE digits still sitting in the boxes → 401; then hit Resend
 * inside the server's 60s cooldown (old client countdown was 30s) → 429.
 *
 * Guards here:
 *  1. Arabic-Indic digits (٠-٩) normalize to ASCII — Arabic keyboards work.
 *  2. Pasting a full 6-digit code distributes across all boxes.
 *  3. A failed verify CLEARS the boxes (stale digits would fail again).
 *  4. 401 → otpFailed copy; 429 → rateLimited copy (classified, not generic).
 *  5. Resend clears the boxes (the previous code is dead once resent).
 *  6. Resend countdown starts at 60s on mount (matches server OTP_COOLDOWN_MS).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import { FetchError } from '@/lib/fetcher';
import VerifyPage from '@/app/[locale]/(auth)/verify/page';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
    usePathname: () => '/en/verify',
    useSearchParams: () => new URLSearchParams('email=tester%40gmail.com'),
}));

vi.mock('@/lib/fetcher', async () => {
    const actual = await vi.importActual<typeof import('@/lib/fetcher')>('@/lib/fetcher');
    return {
        ...actual,
        fetcher: vi.fn(),
    };
});

import { fetcher } from '@/lib/fetcher';
const fetcherMock = vi.mocked(fetcher);

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                <VerifyPage />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

/** The 6 OTP boxes, in order. */
function boxes() {
    return screen.getAllByRole('textbox') as HTMLInputElement[];
}

function fillBoxes(digits: string[]) {
    const inputs = boxes();
    digits.forEach((d, i) => fireEvent.change(inputs[i], { target: { value: d } }));
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('verify page — OTP entry', () => {
    it('normalizes Arabic-Indic digits to ASCII in the boxes', () => {
        renderPage();
        const inputs = boxes();
        fireEvent.change(inputs[0], { target: { value: '٤' } });
        expect(inputs[0].value).toBe('4');
        fireEvent.change(inputs[1], { target: { value: '٩' } });
        expect(inputs[1].value).toBe('9');
    });

    it('distributes a pasted 6-digit code across all boxes', () => {
        renderPage();
        const inputs = boxes();
        fireEvent.paste(inputs[0], {
            clipboardData: { getData: () => '482913' },
        });
        expect(inputs.map((i) => i.value).join('')).toBe('482913');
    });

    it('normalizes Arabic-Indic digits in a pasted code', () => {
        renderPage();
        const inputs = boxes();
        fireEvent.paste(inputs[0], {
            clipboardData: { getData: () => '١٢٣٤٥٦' },
        });
        expect(inputs.map((i) => i.value).join('')).toBe('123456');
    });
});

describe('verify page — failure UX', () => {
    it('clears the boxes and shows otpFailed copy on a 401', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError('Invalid or expired OTP.', 401, 'https://api.test/auth/email/verify-otp'),
        );
        renderPage();
        fillBoxes(['1', '2', '3', '4', '5', '6']);

        fireEvent.click(screen.getByRole('button', { name: /verify/i }));

        await waitFor(() => {
            expect(screen.getByText(enMessages.errors.otpFailed)).toBeInTheDocument();
        });
        expect(boxes().every((i) => i.value === '')).toBe(true);
    });

    it('shows rateLimited copy (not generic) on a 429 verify', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError('Too many attempts.', 429, 'https://api.test/auth/email/verify-otp'),
        );
        renderPage();
        fillBoxes(['1', '2', '3', '4', '5', '6']);

        fireEvent.click(screen.getByRole('button', { name: /verify/i }));

        await waitFor(() => {
            expect(screen.getByText(enMessages.errors.rateLimited)).toBeInTheDocument();
        });
    });

    // The countdown re-arms itself inside an effect, so each advanceTimersByTime
    // fires exactly one tick — burn it tick-by-tick inside act().
    it('clears the boxes when resend fires (old code is dead)', async () => {
        vi.useFakeTimers();
        try {
            fetcherMock.mockResolvedValueOnce({ message: 'ok' });
            renderPage();
            fillBoxes(['9', '9', '9', '9', '9', '9']);

            for (let i = 0; i < 61; i++) {
                await act(async () => {
                    vi.advanceTimersByTime(1000);
                });
            }
            const resend = screen.getByRole('button', { name: /resend/i });
            expect(resend).toBeEnabled();

            fireEvent.click(resend);

            expect(boxes().every((i) => i.value === '')).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('starts the resend countdown at 60s on mount (server cooldown parity)', () => {
        renderPage();
        const resend = screen.getByRole('button', { name: /resend/i });
        expect(resend).toBeDisabled();
        expect(resend.textContent).toContain('60');
    });
});
