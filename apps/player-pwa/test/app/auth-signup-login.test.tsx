/**
 * Regression tests — single-OTP signup + draft survival (2026-09-17 incident).
 *
 * Incident A (double OTP): after OTP verify, a NEW user was pushed to
 * complete-profile WITHOUT populating the auth store. updateUser() no-ops on a
 * null store user → isAuthenticated stayed false → the (main) AuthGuard bounced
 * the fresh signup back to /login for a SECOND code. Both channels affected.
 *
 * Incident B (cleared field): drafts lived in sessionStorage, which dies when
 * iOS discards the backgrounded PWA tab while the user reads the OTP SMS/email.
 * They must survive in localStorage (and be cleared when the flow finishes).
 *
 * Guards here:
 *  1. verify(isNewUser:true) → store authenticated BEFORE navigating to
 *     complete-profile (AuthGuard passes; zero second OTP).
 *  2. verify(isNewUser:false) → store authenticated → /play.
 *  3. /users/me failure → NO navigation (error shown instead of silent guest).
 *  4. Verify identifier self-heals from the draft when ?email/?phone params
 *     are missing (tab-discard restoration path).
 *  5. Drafts survive a sessionStorage wipe (proves the storage tier — jsdom
 *     cannot simulate iOS tab discard, but clearing session storage is the
 *     same observable the device produces: session state gone, draft intact).
 *  6. clearAuthFlow() runs on success (drafts never leak into a future login).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import VerifyPage from '@/app/[locale]/(auth)/verify/page';
import LoginPage from '@/app/[locale]/(auth)/login/page';
import { useAppStore } from '@/store/useAppStore';
import { clearAuthToken } from '@/lib/fetcher';

const pushMock = vi.fn();

const searchParamsMock = vi.fn(() => new URLSearchParams(''));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
    usePathname: () => '/en/verify',
    useSearchParams: () => searchParamsMock(),
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

const PROFILE = {
    id: 'user-1',
    full_name: 'New Player',
    handle: 'new_player',
    avatar_url: null,
    phone: '+966501234567',
    preferred_location: null,
    preferred_position: null,
    role: 'Player',
};

function renderPage(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                {ui}
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

function boxes() {
    return screen.getAllByRole('textbox') as HTMLInputElement[];
}

function fillBoxes(digits: string[]) {
    const inputs = boxes();
    digits.forEach((d, i) => fireEvent.change(inputs[i], { target: { value: d } }));
}

beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.mockReturnValue(new URLSearchParams(''));
    localStorage.clear();
    sessionStorage.clear();
    clearAuthToken();
    // Reset the real store to a signed-out state (persist rehydrates nothing
    // relevant here; jsdom localStorage was cleared above).
    useAppStore.setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isOnboarded: false,
    });
});

describe('signup: ONE OTP, straight in (isNewUser path)', () => {
    it('populates the store BEFORE navigating to complete-profile', async () => {
        searchParamsMock.mockReturnValue(new URLSearchParams('email=new%40gmail.com'));
        // Call order: (1) verify-otp mutation, (2) /users/me profile fetch.
        fetcherMock.mockResolvedValueOnce({ isNewUser: true, token: 'jwt-token' });
        fetcherMock.mockResolvedValueOnce(PROFILE);

        renderPage(<VerifyPage />);
        fillBoxes(['1', '2', '3', '4', '5', '6']);
        fireEvent.click(screen.getByRole('button', { name: /verify/i }));

        await waitFor(() => {
            expect(pushMock).toHaveBeenCalledWith('/en/complete-profile');
        });
        // THE regression: store authenticated + user populated by the time
        // navigation fires — AuthGuard must never see this user as anonymous.
        const state = useAppStore.getState();
        expect(state.isAuthenticated).toBe(true);
        expect(state.user?.id).toBe('user-1');
        expect(state.user?.fullName).toBe('New Player');
        // Token persisted for the Bearer path (prod carrier).
        expect(localStorage.getItem('koralink_token')).toBe('jwt-token');
        // Drafts cleared — no leak into a future login.
        expect(localStorage.getItem('koralink_auth_email_draft')).toBeNull();
    });

    it('returning user: store authenticated → /play', async () => {
        searchParamsMock.mockReturnValue(new URLSearchParams('email=old%40gmail.com'));
        fetcherMock.mockResolvedValueOnce({ isNewUser: false, token: 'jwt-token' });
        fetcherMock.mockResolvedValueOnce(PROFILE);

        renderPage(<VerifyPage />);
        fillBoxes(['1', '2', '3', '4', '5', '6']);
        fireEvent.click(screen.getByRole('button', { name: /verify/i }));

        await waitFor(() => {
            expect(pushMock).toHaveBeenCalledWith('/en/play');
        });
        expect(useAppStore.getState().isAuthenticated).toBe(true);
    });

    it('profile fetch failure: NO navigation (no silent guest handoff)', async () => {
        searchParamsMock.mockReturnValue(new URLSearchParams('email=x%40gmail.com'));
        fetcherMock.mockResolvedValueOnce({ isNewUser: true, token: 'jwt-token' });
        fetcherMock.mockRejectedValueOnce(new Error('401'));

        renderPage(<VerifyPage />);
        fillBoxes(['1', '2', '3', '4', '5', '6']);
        fireEvent.click(screen.getByRole('button', { name: /verify/i }));

        await waitFor(() => {
            expect(screen.getByText(enMessages.verify.profileFetchError)).toBeInTheDocument();
        });
        expect(pushMock).not.toHaveBeenCalled();
    });
});

describe('verify identifier self-heal (tab-discard restoration)', () => {
    it('heals a missing ?email param from the persisted draft', async () => {
        localStorage.setItem('koralink_auth_channel', 'email');
        localStorage.setItem('koralink_auth_email_draft', 'healed@gmail.com');
        // NO query params at all — the discarded-tab restoration URL.
        fetcherMock.mockResolvedValueOnce({ isNewUser: false, token: 'jwt' });
        fetcherMock.mockResolvedValueOnce(PROFILE);

        renderPage(<VerifyPage />);
        fillBoxes(['1', '2', '3', '4', '5', '6']);
        fireEvent.click(screen.getByRole('button', { name: /verify/i }));

        await waitFor(() => {
            expect(fetcherMock).toHaveBeenCalledWith(
                '/auth/email/verify-otp',
                expect.objectContaining({
                    body: expect.stringContaining('healed@gmail.com'),
                }),
            );
        });
    });

    it('heals a missing ?phone param from the persisted phone draft', async () => {
        localStorage.setItem('koralink_auth_channel', 'phone');
        localStorage.setItem('koralink_auth_phone_draft', '501234567');
        fetcherMock.mockResolvedValueOnce({ isNewUser: false, token: 'jwt' });
        fetcherMock.mockResolvedValueOnce(PROFILE);

        renderPage(<VerifyPage />);
        fillBoxes(['1', '2', '3', '4', '5', '6']);
        fireEvent.click(screen.getByRole('button', { name: /verify/i }));

        await waitFor(() => {
            expect(fetcherMock).toHaveBeenCalledWith(
                '/auth/verify-otp',
                expect.objectContaining({
                    body: expect.stringContaining('+966501234567'),
                }),
            );
        });
    });
});

describe('drafts survive the storage tier iOS kills', () => {
    it('login draft survives a sessionStorage wipe (tab discard observable)', () => {
        const view = renderPage(<LoginPage />);
        // jsdom: the login page's placeholders differ per channel; type an email.
        fireEvent.click(screen.getByRole('button', { name: /Continue with email instead/ }));
        const input = screen.getByPlaceholderText('Email address') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'survivor@gmail.com' } });

        // iOS tab discard = sessionStorage gone, localStorage persists.
        sessionStorage.clear();

        view.unmount();
        renderPage(<LoginPage />);

        expect(
            (screen.getByPlaceholderText('Email address') as HTMLInputElement).value,
        ).toBe('survivor@gmail.com');
    });
});
