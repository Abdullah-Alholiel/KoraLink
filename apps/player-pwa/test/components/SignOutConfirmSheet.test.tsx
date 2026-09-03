import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import SignOutConfirmSheet from '@/components/profile/SignOutConfirmSheet';

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

function renderSheet(props: Partial<Parameters<typeof SignOutConfirmSheet>[0]> = {}) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <SignOutConfirmSheet
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        isPending={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('SignOutConfirmSheet (P0-6, run #29)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders the localized title and body when open', () => {
    renderSheet();
    expect(screen.getByText('Sign out?')).toBeInTheDocument();
    expect(
      screen.getByText(/You'll need to enter your phone number/),
    ).toBeInTheDocument();
  });

  it('does not render when isOpen=false', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByText('Sign out?')).not.toBeInTheDocument();
  });

  it('calls onConfirm when the sign-out CTA is tapped', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderSheet({ onConfirm });
    const cta = screen.getByRole('button', { name: /You'll need to sign in again/i });
    await user.click(cta);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the cancel button is tapped', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSheet({ onClose });
    const cancel = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons when isPending=true', () => {
    renderSheet({ isPending: true });
    const cta = screen.getByRole('button', { name: /You'll need to sign in again/i });
    const cancel = screen.getByRole('button', { name: /Cancel/i });
    expect(cta).toBeDisabled();
    expect(cancel).toBeDisabled();
  });
});
