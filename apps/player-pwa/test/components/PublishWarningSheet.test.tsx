import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import PublishWarningSheet from '@/components/host/PublishWarningSheet';

function renderSheet(props: Partial<Parameters<typeof PublishWarningSheet>[0]> = {}) {
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <PublishWarningSheet
        open
        mode="self"
        consentAccepted
        onConsentChange={() => {}}
        onTopUp={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        isPending={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('PublishWarningSheet — contextual publish errors', () => {
  it('renders no error block when clean', () => {
    renderSheet();
    expect(screen.queryByTestId('publish-error')).toBeNull();
  });

  it('renders the localized insufficient-balance error at the moment of failure', () => {
    renderSheet({ errorKey: 'host.errorInsufficientBalance' });
    const alert = screen.getByTestId('publish-error');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.getByText("Couldn't publish")).toBeInTheDocument();
    expect(
      screen.getByText(/wallet doesn't have enough balance/i),
    ).toBeInTheDocument();
  });

  it('re-enables confirm after an error so the user can retry', () => {
    const onConfirm = vi.fn();
    renderSheet({ errorKey: 'host.errorSlotTaken', onConfirm });
    const confirm = screen.getByTestId('confirm-publish');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirm while publishing', () => {
    renderSheet({ isPending: true });
    expect(
      screen.getByRole('button', { name: /publishing/i }),
    ).toBeDisabled();
  });
});

describe('PublishWarningSheet — security deposit (koralink mode)', () => {
  it('koralink: shows the deposit card with deposit, balance, and refund note', () => {
    renderSheet({ mode: 'koralink', depositSar: 375, walletBalanceSar: 500, balanceResolved: true });
    const card = screen.getByTestId('deposit-card');
    expect(card).toBeInTheDocument();
    expect(screen.getByText('Security deposit')).toBeInTheDocument();
    expect(screen.getByText('SAR 375.00')).toBeInTheDocument();
    expect(screen.getByText('SAR 500.00')).toBeInTheDocument();
    expect(screen.getByText(/fully refunded/i)).toBeInTheDocument();
  });

  it('koralink: shows a checking placeholder while the balance loads', () => {
    renderSheet({ mode: 'koralink', depositSar: 375, walletBalanceSar: null, balanceResolved: false });
    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByTestId('wallet-shortfall')).toBeNull();
  });

  it('koralink: shortfall shows the exact deficit + top-up, and confirm is disabled', () => {
    renderSheet({ mode: 'koralink', depositSar: 375, walletBalanceSar: 120, balanceResolved: true });
    const alert = screen.getByTestId('wallet-shortfall');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.getByText('You need SAR 255.00 more in your wallet to host this match.')).toBeInTheDocument();
    expect(screen.getByTestId('top-up-button')).toBeInTheDocument();
    const confirm = screen.getByTestId('confirm-publish');
    expect(confirm).toBeDisabled();
  });

  it('koralink: top-up button fires onTopUp', () => {
    const onTopUp = vi.fn();
    renderSheet({ mode: 'koralink', depositSar: 375, walletBalanceSar: 120, balanceResolved: true, onTopUp });
    fireEvent.click(screen.getByTestId('top-up-button'));
    expect(onTopUp).toHaveBeenCalledTimes(1);
  });

  it('koralink: server-confirmed shortfall blocks publish even when the local balance looked sufficient', () => {
    renderSheet({ mode: 'koralink', depositSar: 375, walletBalanceSar: 500, balanceResolved: true, serverShortfallSar: 255 });
    expect(screen.getByTestId('wallet-shortfall')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-publish')).toBeDisabled();
  });

  it('koralink: balance fetch failure must NOT block publishing (server stays authoritative)', () => {
    renderSheet({ mode: 'koralink', depositSar: 375, walletBalanceSar: null, balanceResolved: true });
    expect(screen.queryByTestId('wallet-shortfall')).toBeNull();
    expect(screen.getByTestId('confirm-publish')).toBeEnabled();
  });

  it('self mode: no deposit card, no shortfall, confirm always available', () => {
    renderSheet({ mode: 'self', depositSar: 375, walletBalanceSar: 0, balanceResolved: true });
    expect(screen.queryByTestId('deposit-card')).toBeNull();
    expect(screen.queryByTestId('wallet-shortfall')).toBeNull();
    expect(screen.getByTestId('confirm-publish')).toBeEnabled();
  });
});

describe('PublishWarningSheet — hosting-terms consent (player-host-responsibility)', () => {
  it('confirm is DISABLED until the host accepts the hosting terms', () => {
    renderSheet({ consentAccepted: false });
    expect(screen.getByTestId('confirm-publish')).toBeDisabled();
  });

  it('toggling consent re-enables confirm and calls onConsentChange', () => {
    const onConsentChange = vi.fn();
    renderSheet({ consentAccepted: false, onConsentChange });
    fireEvent.click(screen.getByTestId('hosting-consent'));
    expect(onConsentChange).toHaveBeenCalledWith(true);
  });

  it('self mode renders the STRONGER consent copy (host runs everything)', () => {
    renderSheet({ mode: 'self' });
    expect(screen.getByText('Hosting responsibility')).toBeInTheDocument();
    expect(screen.getByText(/SELF-BOOKED venue/i)).toBeInTheDocument();
  });

  it('koralink mode renders the shared-responsibility consent copy', () => {
    renderSheet({ mode: 'koralink' });
    expect(screen.getByText(/KoraLink books the pitch/i)).toBeInTheDocument();
  });
});
