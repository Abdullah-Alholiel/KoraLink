import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import DeleteAccountSheet from '@/components/profile/DeleteAccountSheet';

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

function renderSheet(props: Partial<Parameters<typeof DeleteAccountSheet>[0]> = {}) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <DeleteAccountSheet
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        purgeDate="2026-10-03T00:00:00.000Z"
        isPending={false}
        errorMessage={null}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('DeleteAccountSheet (P0-6, run #29)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders the warning copy with a localized date when open', () => {
    renderSheet();
    expect(screen.getByText('Delete your account?')).toBeInTheDocument();
    // The warning box mentions the scheduled-purge date. The exact
    // format depends on the test runtime's locale, so we assert the
    // COPY BEFORE the date is present.
    expect(
      screen.getByText(/Your account will be permanently deleted on/),
    ).toBeInTheDocument();
    // The CTAs are present
    expect(
      screen.getByRole('button', { name: /Delete my account/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Cancel/i }),
    ).toBeInTheDocument();
  });

  it('does not render when isOpen=false', () => {
    renderSheet({ isOpen: false });
    expect(
      screen.queryByText('Delete your account?'),
    ).not.toBeInTheDocument();
  });

  it('calls onConfirm when the destructive CTA is tapped', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderSheet({ onConfirm });
    const cta = screen.getByRole('button', { name: /Delete my account/i });
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

  it('disables the CTA when isPending=true', () => {
    renderSheet({ isPending: true });
    const cta = screen.getByRole('button', { name: /Delete my account/i });
    expect(cta).toBeDisabled();
  });

  it('renders the error message when errorMessage is provided', () => {
    renderSheet({ errorMessage: 'Account scheduled for deletion.' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Account scheduled for deletion.');
  });

  it('does not show the error message when errorMessage is null', () => {
    renderSheet({ errorMessage: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
