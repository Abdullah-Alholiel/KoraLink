import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import PersonalInfoPage from '@/app/[locale]/(main)/personal-info/page';
import {
    useUserProfile,
    useUserStats,
    useUpdateProfile,
} from '@/hooks/useUser';

// sketches/004 follow-up (2026-09-06): Personal Info now wears the Stadium
// Night system — standard AppBar, green profile-hero, SHARED GlassStats
// (Abdullah: "tailor personal information screen… same to profile screen").

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/hooks/useUser', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/useUser')>('@/hooks/useUser');
    return {
        ...actual,
        useUserProfile: vi.fn(),
        useUserStats: vi.fn(),
        useUpdateProfile: vi.fn(),
    };
});

const { useAppStore } = await import('@/store/useAppStore');

function mockData() {
    vi.mocked(useUserProfile).mockReturnValue({
        data: {
            full_name: 'Ahmed Al-Rashid',
            handle: 'ahmed.rashid',
            phone: '+966500000001',
            avatar_url: null,
            pom_count: 3,
            preferred_position: 'Midfielder',
            preferred_location: 'Riyadh',
        },
    } as never);
    vi.mocked(useUserStats).mockReturnValue({
        data: { games_played: 12, karma_score: 10 },
    } as never);
    vi.mocked(useUpdateProfile).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
}

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <NextIntlClientProvider messages={enMessages} locale="en">
                <PersonalInfoPage />
            </NextIntlClientProvider>
        </QueryClientProvider>,
    );
}

describe('PersonalInfoPage — Stadium Night system (sketches/004 follow-up)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        useAppStore.setState({ user: null } as never);
    });

    it('renders the green hero WITHOUT the brand bar (title+logo live on main pages only, 2026-09-09)', () => {
        mockData();
        renderPage();
        expect(document.querySelector('.bg-profile-hero')).not.toBeNull();
        // The KoraLink logo/wordmark (AppBar) is intentionally absent here —
        // it renders on main pages (Play/Profile/Feed), not sub-screens.
        expect(screen.queryByText('KoraLink')).toBeNull();
        expect(screen.getByText('Ahmed Al-Rashid')).toBeInTheDocument();
    });

    it('renders the SHARED GlassStats bar (pixel-identical to Profile) with real values', () => {
        mockData();
        renderPage();
        const row = screen.getByTestId('stats-row');
        expect(row.querySelector('.backdrop-blur-md')).not.toBeNull();
        expect(row.textContent).toContain('12');
        expect(row.textContent).toContain('3');
        expect(row.textContent).toContain('10');
    });

    it('keeps flat hairline detail rows and no card chrome', () => {
        mockData();
        renderPage();
        expect(screen.queryByTestId('skill-line')).toBeNull();
        expect(screen.getByText('+966500000001')).toBeInTheDocument();
        // no card chrome — flat system
        expect(document.querySelector('.shadow-card')).toBeNull();
    });
});
