/**
 * Cutover Card 2 (2026-11-16, P1) — complete-profile field-specific errors.
 *
 * Contract (brief, fix #2): when the API returns a field-specific error it is
 * shown ON that field with localized copy (EN + AR); the generic "something is
 * invalid" text is only for errors that truly have no field. The handle has no
 * visible field here (server-derived from the name), so handle-scoped errors
 * surface on the Full Name field — the field the user can actually change.
 *
 * The server auto-picks a free handle on collision (auth.complete-profile.spec),
 * so HANDLE_TAKEN reaches this screen ONLY when contention exhausted every
 * retry — the copy must say retry, never blame the user's details.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import CompleteProfilePage from '@/app/[locale]/(auth)/complete-profile/page';
import { FetchError } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';

const pushMock = vi.fn();
const pathnameMock = vi.fn(() => '/en/complete-profile');

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
    usePathname: () => pathnameMock(),
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

const PROFILE = {
    id: 'user-1',
    full_name: 'Abdullah',
    handle: 'abdullah_57',
    avatar_url: null,
    phone: '+966****4567',
    preferred_location: null,
    preferred_position: null,
    role: 'Player',
};

function renderPage(locale: 'en' | 'ar') {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const messages = locale === 'ar' ? arMessages : enMessages;
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={messages} locale={locale}>
                <CompleteProfilePage />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

/** Locale-aware: placeholder + button accessible name come from THAT locale's messages. */
function fillNameAndSave(name: string, locale: 'en' | 'ar' = 'en') {
    const messages = locale === 'ar' ? arMessages : enMessages;
    fireEvent.change(screen.getByPlaceholderText(messages.completeProfile.fullNamePlaceholder), {
        target: { value: name },
    });
    fireEvent.click(screen.getByRole('button', { name: messages.completeProfile.save }));
}

beforeEach(() => {
    // resetAllMocks (NOT clearAllMocks): clears once-implementations too — a
    // test that fails BEFORE consuming its mockRejectedValueOnce would
    // otherwise leak that rejection into the next test's fetch queue.
    vi.resetAllMocks();
    pathnameMock.mockReturnValue('/en/complete-profile');
    localStorage.clear();
    useAppStore.setState({ user: null, token: null, isAuthenticated: false, isOnboarded: false });
});

describe('handle contention surfaces ON the name field (not a generic toast)', () => {
    it('HANDLE_TAKEN (409 after all auto-pick retries) renders the localized field error', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError('Handle already taken.', 409, '/auth/complete-profile', 'HANDLE_TAKEN'),
        );

        renderPage('en');
        fillNameAndSave('Abdullah');

        await waitFor(() => {
            expect(screen.getByTestId('handle-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('handle-error')).toHaveTextContent(
            enMessages.errors.handleTaken,
        );
        // The generic "something is invalid" copy must NOT appear.
        expect(screen.queryByTestId('profile-error')).not.toBeInTheDocument();
        expect(screen.queryByText(enMessages.errors.validation)).not.toBeInTheDocument();
        // Retry stays enabled — the error is transient contention, not invalid input.
        expect(screen.getByRole('button', { name: /Save Profile/i })).toBeEnabled();
    });

    it('the same 409 renders ARABIC copy on the ar locale', async () => {
        pathnameMock.mockReturnValue('/ar/complete-profile');
        fetcherMock.mockRejectedValueOnce(
            new FetchError('Handle already taken.', 409, '/auth/complete-profile', 'HANDLE_TAKEN'),
        );

        renderPage('ar');
        fillNameAndSave('عبدالله', 'ar');

        await waitFor(() => {
            expect(screen.getByTestId('handle-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('handle-error')).toHaveTextContent(
            arMessages.errors.handleTaken,
        );
    });

    it('editing the name clears the field error (the user acted on it)', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError('Handle already taken.', 409, '/auth/complete-profile', 'HANDLE_TAKEN'),
        );

        renderPage('en');
        fillNameAndSave('Abdullah');
        await waitFor(() => {
            expect(screen.getByTestId('handle-error')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText(enMessages.completeProfile.fullNamePlaceholder), {
            target: { value: 'Abdullah A.' },
        });
        expect(screen.queryByTestId('handle-error')).not.toBeInTheDocument();
    });
});

describe('errors with no field still use the generic block', () => {
    it('a plain validation 400 renders the generic copy (legacy behavior preserved)', async () => {
        fetcherMock.mockRejectedValueOnce(
            new FetchError('Some details are missing or invalid.', 400, '/auth/complete-profile'),
        );

        renderPage('en');
        fillNameAndSave('Abdullah');

        await waitFor(() => {
            expect(screen.getByTestId('profile-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('profile-error')).toHaveTextContent(
            enMessages.errors.validation,
        );
        expect(screen.queryByTestId('handle-error')).not.toBeInTheDocument();
    });
});

describe('the request never carries a client-derived handle (server owns derivation)', () => {
    it('sends full_name only — no handle key in the body', async () => {
        fetcherMock.mockResolvedValueOnce(PROFILE);

        renderPage('en');
        fillNameAndSave('Abdullah');

        await waitFor(() => {
            expect(pushMock).toHaveBeenCalledWith('/en/play');
        });
        const call = fetcherMock.mock.calls.find((c) => c[0] === '/auth/complete-profile');
        expect(call).toBeTruthy();
        const body = JSON.parse((call![1] as { body: string }).body);
        expect(body).toEqual({
            full_name: 'Abdullah',
            preferred_location: undefined,
            preferred_position: undefined,
        });
        expect('handle' in body).toBe(false);
    });
});
