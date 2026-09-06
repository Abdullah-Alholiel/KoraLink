import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import EmailSection from '@/components/profile/EmailSection';
import {
    useUserProfile,
    useSetEmail,
    useResendEmailVerification,
    useUpdateEmailPreferences,
} from '@/hooks/useUser';

// P1-41 PWA residual (owner session, 2026-09-06): the email add/verify/mute
// section that was blocked on the host-onboarding staging collision.

vi.mock('@/hooks/useUser', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/useUser')>('@/hooks/useUser');
    return {
        ...actual,
        useUserProfile: vi.fn(),
        useSetEmail: vi.fn(),
        useResendEmailVerification: vi.fn(),
        useUpdateEmailPreferences: vi.fn(),
    };
});

function mockProfile(
    email: string | null,
    verified: boolean,
    muted = false,
) {
    vi.mocked(useUserProfile).mockReturnValue({
        data: {
            email,
            email_verified_at: verified ? '2026-01-01T00:00:00.000Z' : null,
            email_muted: muted,
        },
    } as never);
}

const mutateAsync = vi.fn();
const resendAsync = vi.fn();
const prefsMutate = vi.fn();

function mockMutations() {
    vi.mocked(useSetEmail).mockReturnValue({
        mutateAsync,
        isPending: false,
    } as never);
    vi.mocked(useResendEmailVerification).mockReturnValue({
        mutateAsync: resendAsync,
        isPending: false,
    } as never);
    vi.mocked(useUpdateEmailPreferences).mockReturnValue({
        mutate: prefsMutate,
        isPending: false,
    } as never);
}

function renderSection() {
    return render(
        <NextIntlClientProvider messages={enMessages} locale="en">
            <EmailSection />
        </NextIntlClientProvider>,
    );
}

describe('EmailSection (P1-41, owner session 2026-09-06)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockMutations();
    });

    it('shows the add form with the no-marketing promise when no email is set', () => {
        mockProfile(null, false);
        renderSection();
        expect(screen.getByText('Email notifications')).toBeInTheDocument();
        expect(screen.getByLabelText('Email address')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add email' })).toBeInTheDocument();
        expect(screen.getByText(/No marketing\./)).toBeInTheDocument();
    });

    it('rejects an invalid address client-side and never calls the API', async () => {
        const user = userEvent.setup();
        mockProfile(null, false);
        renderSection();
        await user.type(screen.getByLabelText('Email address'), 'not-an-email');
        await user.click(screen.getByRole('button', { name: 'Add email' }));
        expect(screen.getByRole('alert')).toHaveTextContent(/doesn't look like a valid email/i);
        expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('shows the verified badge, mute toggle (wired to emailMuted), and change action', async () => {
        const user = userEvent.setup();
        mockProfile('player@example.com', true, false);
        renderSection();
        expect(screen.getByText('player@example.com')).toBeInTheDocument();
        expect(screen.getByText('Verified')).toBeInTheDocument();
        await user.click(screen.getByRole('switch'));
        expect(prefsMutate).toHaveBeenCalledWith({ emailMuted: true });
        expect(screen.getByRole('button', { name: 'Change email' })).toBeInTheDocument();
    });

    it('offers resend verification for an unverified address and confirms the send', async () => {
        const user = userEvent.setup();
        mockProfile('player@example.com', false, false);
        renderSection();
        const resendBtn = screen.getByRole('button', { name: 'Resend' });
        expect(resendBtn).toBeInTheDocument();
        await user.click(resendBtn);
        expect(resendAsync).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/Verification email sent/)).toBeInTheDocument();
    });

    it('maps a 409 (already in use) to the taken-copy', async () => {
        const user = userEvent.setup();
        mockProfile(null, false);
        mutateAsync.mockRejectedValueOnce(new Error('409 already in use'));
        renderSection();
        await user.type(screen.getByLabelText('Email address'), 'taken@example.com');
        await user.click(screen.getByRole('button', { name: 'Add email' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/already in use on another account/i);
    });
});
