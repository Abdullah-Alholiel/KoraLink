import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import ProfilePage from '@/app/[locale]/(main)/profile/page';
import {
    useUserProfile,
    useUserStats,
    useUpdatePushPreferences,
    useSoftDeleteAccount,
    useExportMyData,
    useRestoreAccount,
    useSetEmail,
    useResendEmailVerification,
    useUpdateEmailPreferences,
} from '@/hooks/useUser';
import { useWalletBalance } from '@/hooks/useWallet';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAppStore } from '@/store/useAppStore';

// sketches/004-profile-redesign V2 "Stadium Night" r2 (owner session,
// 2026-09-06): brand-green gradient hero, glass stats bar, flat borderless
// section list. All P0/P1/P2 behaviour (PDPL sheets, install hint, prefs,
// wallet error affordance) is preserved from runs #28/#29 and guarded here.

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/en/profile',
}));

vi.mock('@/hooks/useUser', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/useUser')>('@/hooks/useUser');
    // EmailSection's mutations ride the same module — stubbed below so the
    // page test never needs a QueryClientProvider.
    return {
        ...actual,
        useUserProfile: vi.fn(),
        useUserStats: vi.fn(),
        useUpdatePushPreferences: vi.fn(),
        useSoftDeleteAccount: vi.fn(),
        useExportMyData: vi.fn(),
        useRestoreAccount: vi.fn(),
        useSetEmail: vi.fn(),
        useResendEmailVerification: vi.fn(),
        useUpdateEmailPreferences: vi.fn(),
    };
});

vi.mock('@/hooks/useWallet', () => ({
    useWalletBalance: vi.fn(),
}));

vi.mock('@/hooks/usePushNotifications', () => ({
    usePushNotifications: vi.fn(),
}));

function mockUserData(overrides?: {
    stats?: { data?: Record<string, number>; isLoading?: boolean; error?: unknown };
    profile?: Record<string, unknown> | undefined;
}) {
    vi.mocked(useUserProfile).mockReturnValue({
        data: (overrides?.profile ?? {
            full_name: 'Ahmed Al-Rashid',
            handle: '@ahmed.rashid',
            avatar_url: null,
            pom_count: 3,
        }) as never,
    } as never);
    vi.mocked(useUserStats).mockReturnValue({
        data: overrides?.stats?.data ?? { games_played: 24, karma_score: 4.8 },
        isLoading: overrides?.stats?.isLoading ?? false,
        error: overrides?.stats?.error ?? null,
        refetch: refetchStats,
    } as never);
    vi.mocked(useUpdatePushPreferences).mockReturnValue({ mutate: prefsMutate, isPending: false } as never);
    vi.mocked(useSoftDeleteAccount).mockReturnValue({ mutateAsync: vi.fn(), isPending: false, error: null } as never);
    vi.mocked(useExportMyData).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(useRestoreAccount).mockReturnValue({ mutateAsync: vi.fn(), isPending: false, error: null } as never);
    vi.mocked(useWalletBalance).mockReturnValue({
        data: { balance: 150 },
        error: null,
        refetch: refetchWallet,
    } as never);
}

const refetchStats = vi.fn();
const refetchWallet = vi.fn();
const prefsMutate = vi.fn();

function renderPage() {
    return render(
        <NextIntlClientProvider messages={enMessages} locale="en">
            <ProfilePage />
        </NextIntlClientProvider>,
    );
}

describe('ProfilePage — Stadium Night redesign (sketches/004, 2026-09-06)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        refetchStats.mockResolvedValue(undefined);
        refetchWallet.mockResolvedValue(undefined);
    const stubMutation = () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false, error: null });
    // EmailSection's mutations ride the same module — re-seed after resetAllMocks
    vi.mocked(useSetEmail).mockReturnValue(stubMutation() as never);
    vi.mocked(useResendEmailVerification).mockReturnValue(stubMutation() as never);
    vi.mocked(useUpdateEmailPreferences).mockReturnValue(stubMutation() as never);
        // resetAllMocks wipes factory-set implementations — re-seed explicitly
        vi.mocked(usePushNotifications).mockReturnValue({
            isSubscribed: false,
            isSubscribing: false,
            isSupported: false,
            subscribe: vi.fn(async () => true),
            unsubscribe: vi.fn(),
        } as never);
        useAppStore.setState({ user: null, isAuthenticated: false } as never);
    });

    it('renders the green identity hero: brandmark, name, handle, white edit pill', () => {
        mockUserData();
        renderPage();
        expect(screen.getByText('KoraLink')).toBeInTheDocument();
        expect(screen.getByText('Ahmed Al-Rashid')).toBeInTheDocument();
        expect(screen.getByText('@ahmed.rashid')).toBeInTheDocument();
        // 2026-09-09: ONE edit affordance — the white pill only. The camera
        // badge (photo-add) was removed: there is no photo storage yet, and
        // "Edit Profile" navigates to personal-info (text fields only).
        expect(screen.getAllByRole('button', { name: 'Edit Profile' })).toHaveLength(1);
        // V2 r2: hero carries the profile-hero gradient token (Abdullah:
        // "not too dark, same colours as the design system")
        expect(document.querySelector('.bg-profile-hero')).not.toBeNull();
    });

    it('shows the glass stats bar (games / POTM / karma) when authenticated', () => {
        mockUserData();
        useAppStore.setState({ user: null, isAuthenticated: true } as never);
        renderPage();
        expect(screen.getByText('24')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('4.8')).toBeInTheDocument();
        expect(screen.getByText('Games Played')).toBeInTheDocument();
        expect(screen.getByText('Karma')).toBeInTheDocument();
    });

    it('keeps the stats loading skeleton inside the hero (P2-26)', () => {
        mockUserData({ stats: { isLoading: true } });
        useAppStore.setState({ user: null, isAuthenticated: true } as never);
        const { container } = renderPage();
        expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('keeps the stats error + retry affordance inside the hero (P2-26)', async () => {
        const user = userEvent.setup();
        mockUserData({ stats: { error: new Error('boom') } });
        useAppStore.setState({ user: null, isAuthenticated: true } as never);
        renderPage();
        // With push rows unmounted (not supported) the only "Try Again" is the stats one
        await user.click(screen.getByRole('button', { name: 'Try Again' }));
        expect(refetchStats).toHaveBeenCalled();
    });

    it('renders the flat sections: labels, all rows, and NO card chrome', () => {
        mockUserData();
        const { container } = renderPage();
        expect(screen.getByText('Playing')).toBeInTheDocument();
        expect(screen.getByText('Preferences')).toBeInTheDocument();
        expect(screen.getByText('Account')).toBeInTheDocument();
        expect(screen.getByText('Personal Information')).toBeInTheDocument();
        expect(screen.getByText('My Games')).toBeInTheDocument();
        expect(screen.getByText('My Reports')).toBeInTheDocument();
        expect(screen.getByText('Wallet')).toBeInTheDocument();
        expect(screen.getByText('SAR 150.00')).toBeInTheDocument();
        expect(screen.getByText('Language')).toBeInTheDocument();
        expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
        expect(screen.getByText('Terms of Service')).toBeInTheDocument();
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
        // Flat-list regression guard: the old stacked-card look must stay gone
        expect(container.querySelector('.shadow-card')).toBeNull();
        expect(container.querySelector('.rounded-2xl.bg-white')).toBeNull();
    });

    it('sign out opens the PDPL confirm sheet (dialog)', async () => {
        const user = userEvent.setup();
        mockUserData();
        renderPage();
        await user.click(screen.getByText('Sign Out'));
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('wallet error keeps the row tappable for retry and shows the alert (P0-6)', async () => {
        const user = userEvent.setup();
        mockUserData();
        vi.mocked(useWalletBalance).mockReturnValue({
            data: undefined,
            error: { status: 0 } as never,
            refetch: refetchWallet,
        } as never);
        renderPage();
        expect(screen.getByRole('alert')).toHaveTextContent('Offline');
        // With stats healthy, the only "Try Again" on screen is the wallet's
        await user.click(screen.getByRole('button', { name: 'Try Again' }));
        expect(refetchWallet).toHaveBeenCalled();
    });
});
