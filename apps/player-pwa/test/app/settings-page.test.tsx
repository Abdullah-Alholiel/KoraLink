/**
 * Settings hub (P2-133, run #104) — page-level specs.
 *
 * The hub is a LINK surface: it must render every preference entry point
 * (push settings, host guide, email section, data rights, legal, language,
 * sign-out) with correct hrefs, WITHOUT duplicating any state (the PDPL
 * sheets and push toggles stay on the profile page — deep-link anchors
 * #notifications / #account are the contract).
 *
 * Mocks: next/navigation (pathname drives the locale), EmailSection (has its
 * own component specs; here it's a stub), useOnlineStatus (online).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import arMessages from '@/messages/ar.json';
import SettingsPage from '@/app/[locale]/(main)/settings/page';

let mockPathname = '/en/settings';
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
    useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/components/profile/EmailSection', () => ({
    default: () => <div data-testid="email-section-stub" />,
}));

vi.mock('@/hooks/useOnlineStatus', () => ({
    useOnlineStatus: () => true,
}));

function renderPage(locale: 'en' | 'ar') {
    mockPathname = `/${locale}/settings`;
    return render(
        <NextIntlClientProvider
            messages={locale === 'ar' ? arMessages : enMessages}
            locale={locale}
        >
            <SettingsPage />
        </NextIntlClientProvider>,
    );
}

describe('settings hub (P2-133)', () => {
    it('renders the header title and every section label (EN)', () => {
        renderPage('en');
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByText('My data')).toBeInTheDocument();
        expect(screen.getByText('Privacy & legal')).toBeInTheDocument();
        expect(screen.getByText('Account')).toBeInTheDocument();
    });

    it('links push settings + data actions to the profile anchors (LINK, never duplicate)', () => {
        renderPage('en');
        const push = screen.getByText('Push notification settings').closest('a');
        expect(push).toHaveAttribute('href', '/en/profile#notifications');
        const exportRow = screen.getByText('Download my data').closest('a');
        expect(exportRow).toHaveAttribute('href', '/en/profile#account');
        const deleteRow = screen.getByText('Delete my account').closest('a');
        expect(deleteRow).toHaveAttribute('href', '/en/profile#account');
        const signOut = screen.getByText('Sign Out').closest('a');
        expect(signOut).toHaveAttribute('href', '/en/profile#account');
    });

    it('shows the PDPL data note (what export/delete do, 30-day grace)', () => {
        renderPage('en');
        expect(screen.getByRole('note')).toHaveTextContent(/30-day grace window/);
    });

    it('renders the language toggle row with a localized aria label', () => {
        renderPage('en');
        expect(screen.getByTestId('language-toggle')).toHaveAttribute(
            'aria-label',
            'Language',
        );
    });

    it('renders the Arabic surface with localized labels (RTL parity)', () => {
        renderPage('ar');
        expect(screen.getByRole('heading', { name: 'الإعدادات' })).toBeInTheDocument();
        expect(screen.getByText('إعدادات الإشعارات الفورية')).toBeInTheDocument();
        expect(screen.getByText('بياناتي')).toBeInTheDocument();
        expect(screen.getByTestId('language-toggle')).toHaveAttribute(
            'aria-label',
            'اللغة',
        );
    });

    it('links the host guide row to the host-guide route', () => {
        renderPage('en');
        const row = screen.getByText('Host guide').closest('a');
        expect(row).toHaveAttribute('href', '/en/host-guide');
    });

    it('renders legal links to privacy + terms routes', () => {
        renderPage('en');
        expect(screen.getByText('Privacy Policy').closest('a')).toHaveAttribute(
            'href',
            '/en/privacy',
        );
        expect(screen.getByText('Terms of Service').closest('a')).toHaveAttribute(
            'href',
            '/en/terms',
        );
    });
});
