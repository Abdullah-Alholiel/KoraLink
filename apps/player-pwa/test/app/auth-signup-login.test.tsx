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
 *  6. Drafts live until the flow's TRUE finish line: verify KEEPS them on the
 *     new-user path (complete-profile back-nav must restore channel + input);
 *     complete-profile's Save success clears them (no leak into future logins).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import VerifyPage from '@/app/[locale]/(auth)/verify/page';
import LoginPage from '@/app/[locale]/(auth)/login/page';
import CompleteProfilePage from '@/app/[locale]/(auth)/complete-profile/page';
import { useAppStore } from '@/store/useAppStore';
import { clearAuthToken } from '@/lib/fetcher';

const pushMock = vi.fn();

const searchParamsMock = vi.fn(() => new URLSearchParams(''));
const pathnameMock = vi.fn(() => '/en/verify');

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
    usePathname: () => pathnameMock(),
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
    pathnameMock.mockReturnValue('/en/verify');
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
        // Drafts SURVIVE the new-user path — complete-profile is not the flow's
        // finish line; its back-navigation must restore the channel + input.
        // (clearAuthFlow moved to complete-profile's Save success.)
        expect(localStorage.getItem('koralink_auth_email_draft')).toBe('new@gmail.com');
        expect(localStorage.getItem('koralink_auth_channel')).toBe('email');
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

    it('profile fetch failure: NO navigation + drafts KEPT (user can retry or edit)', async () => {
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
        expect(localStorage.getItem('koralink_auth_email_draft')).toBe('x@gmail.com');
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
        // jsdom: switch to the email channel via the segmented selector.
        fireEvent.click(screen.getByRole('button', { name: 'Email' }));
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

describe('complete-profile exit (drafts live until the flow finishes)', () => {
    it('Save success = finish line: navigates to /play AND clears the drafts', async () => {
        // Complete-profile renders ONLY after a verified OTP; seed storage the
        // way verify now leaves it (identifier + frozen channel still alive).
        localStorage.setItem('koralink_auth_channel', 'email');
        localStorage.setItem('koralink_auth_email_draft', 'new@gmail.com');
        localStorage.setItem('koralink_auth_phone_draft', '');
        fetcherMock.mockResolvedValueOnce({ success: true });

        renderPage(<CompleteProfilePage />);
        fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
            target: { value: 'E2E Probe' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Save Profile/i }));

        await waitFor(() => {
            expect(pushMock).toHaveBeenCalledWith('/en/play');
        });
        // Nothing may leak into a future login.
        expect(localStorage.getItem('koralink_auth_email_draft')).toBeNull();
        expect(localStorage.getItem('koralink_auth_channel')).toBeNull();
    });
});

describe('channel selector (design A) — EN/AR parity', () => {
    it('renders localized segments + group label in Arabic, phone active by default', () => {
        pathnameMock.mockReturnValue('/ar/login');
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <NextIntlClientProvider messages={arMessages} locale="ar">
                    <LoginPage />
                </NextIntlClientProvider>
            </QueryClientProvider>,
        );

        // Group carries the localized accessible name + test id.
        expect(
            screen.getByRole('group', { name: arMessages.login.channelSelector }),
        ).toHaveAttribute('data-testid', 'channel-selector');
        // Phone segment active by default; email inactive.
        expect(screen.getByRole('button', { name: arMessages.login.channelPhone })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByRole('button', { name: arMessages.login.channelEmail })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
    });
});
