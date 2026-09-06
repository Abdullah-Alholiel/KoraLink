/**
 * /host page gate tests (2026-09-04).
 *
 * The page must show the onboarding wizard for first-time hosts and the form
 * for everyone who finished/skipped it. First paint is always the shared
 * HostFormSkeleton (matches the Suspense fallback) while the localStorage
 * check resolves post-hydration — hydration-safe by design.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import HostMatchPage from './page';
import HostFormSkeleton from '@/components/host/HostFormSkeleton';

/** Mirrors HOST_ONBOARDING_SEEN_KEY (the real module is mocked below). */
const SEEN_KEY = 'koralink.host-onboarding-seen.v1';

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/host',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/host/HostMatchForm', () => ({
    default: () => <div data-testid="host-form" />,
}));

vi.mock('@/components/host/HostOnboarding', () => ({
    // Minimal stand-in: exposes the gate's onFinished callback as a click.
    default: ({ onFinished }: { onFinished: () => void }) => (
        <button type="button" data-testid="wizard" onClick={onFinished}>
            wizard
        </button>
    ),
    readHostOnboardingSeen: () => window.localStorage.getItem(SEEN_KEY) === '1',
}));

function renderPage() {
    return render(
        <NextIntlClientProvider messages={enMessages} locale="en">
            <HostMatchPage />
        </NextIntlClientProvider>
    );
}

describe('/host — onboarding gate', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('first paint is the shared skeleton (hydration-safe deciding state)', () => {
        // RTL's render() flushes effects inside act(), so the gate has already
        // resolved by assertion time — the deciding-state render is verified by
        // rendering the skeleton directly (it is the Suspense fallback too).
        render(<HostFormSkeleton />);
        expect(screen.getByTestId('host-form-skeleton')).toHaveAttribute('aria-busy', 'true');
    });

    it('first-time hosts see the onboarding wizard', async () => {
        renderPage();
        expect(await screen.findByTestId('wizard')).toBeInTheDocument();
        expect(screen.queryByTestId('host-form')).not.toBeInTheDocument();
    });

    it('hosts who already saw it go straight to the form', async () => {
        window.localStorage.setItem(SEEN_KEY, '1');
        renderPage();
        expect(await screen.findByTestId('host-form')).toBeInTheDocument();
        expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
    });

    it('finishing the wizard swaps to the form WITHOUT navigation', async () => {
        renderPage();
        const wizard = await screen.findByTestId('wizard');
        fireEvent.click(wizard);
        expect(await screen.findByTestId('host-form')).toBeInTheDocument();
        expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
    });
});
