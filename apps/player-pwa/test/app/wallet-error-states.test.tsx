import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import WalletPage from '@/app/[locale]/(main)/wallet/page';
import { useAppStore } from '@/store/useAppStore';

// ── P2-260: the history error block is a role=status live region carrying
// the money-surface "no money was taken" reassurance.
//
// P2-331 (run #197): the legacy dummy top-up modal (client-amount
// self-credit via the removed legacy route) is GONE. The Top-Up action
// ALWAYS opens the Moyasar TopupSheet; with the server flag off the sheet
// shows the localized "top-up unavailable" notice instead of a fake credit
// form. Intent/verify error classification is covered by TopupSheet.test.tsx.

const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  FetchError: class FetchError extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/en/wallet',
}));

vi.mock('@/lib/download', () => ({ downloadTextAsFile: vi.fn() }));

vi.mock('@/providers/ObservabilityProvider', () => ({
  trackEvent: vi.fn(),
  captureError: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <WalletPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function mockApi(opts: { historyFails?: boolean; topupEnabled?: boolean } = {}) {
  mockFetcher.mockImplementation(async (path: string) => {
    if (path === '/wallet/balance') return { balance: '100.00' };
    if (path === '/wallet/topup/config') {
      return opts.topupEnabled
        ? { enabled: true, publishableKey: 'pk_test_x', minAmount: 5, maxAmount: 2000 }
        : { enabled: false, publishableKey: null, minAmount: 5, maxAmount: 2000 };
    }
    if (path.startsWith('/wallet/topup/latest')) return { intent: null };
    if (path.startsWith('/wallet/history') || path.startsWith('/wallet/transactions')) {
      if (opts.historyFails) throw Object.assign(new Error('x'), { status: 500 });
      return { transactions: [], total: 0, hasMore: false };
    }
    return { transactions: [], total: 0, hasMore: false };
  });
}

async function openTopup() {
  renderPage();
  const openers = await screen.findAllByRole('button', { name: enMessages.wallet.topUp });
  fireEvent.click(openers[0]);
}

/** No call ever hits the removed legacy self-credit route (exact path). */
function expectNoLegacyTopupCall() {
  for (const call of mockFetcher.mock.calls) {
    expect(call[0]).not.toBe('/wallet/topup');
  }
}

describe('WalletPage top-up — single Moyasar surface (P2-331)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ toast: null } as never);
  });

  it('flag off: Top-Up opens the TopupSheet with the localized unavailable notice (no fake credit form)', async () => {
    mockApi({ topupEnabled: false });
    await openTopup();
    // The page fetched the config before the click; wait for the flag to land.
    const notice = await screen.findByTestId('topup-disabled-notice');
    expect(within(notice).getByText(enMessages.wallet.topupDisabled)).toBeTruthy();
    expect(notice.getAttribute('role')).toBe('status');
    // Neither the legacy dummy amount input nor the Moyasar form is offered.
    expect(screen.queryByPlaceholderText('0')).toBeNull();
    expect(screen.queryByRole('button', { name: enMessages.wallet.topup.payWithCard })).toBeNull();
    expectNoLegacyTopupCall();
  });

  it('flag on: Top-Up opens the real Moyasar TopupSheet form', async () => {
    mockApi({ topupEnabled: true });
    renderPage();
    await waitFor(() =>
      expect(mockFetcher.mock.calls.some((c) => c[0] === '/wallet/topup/config')).toBe(true),
    );
    const openers = await screen.findAllByRole('button', { name: enMessages.wallet.topUp });
    fireEvent.click(openers[0]);
    expect(
      await screen.findByRole('button', { name: enMessages.wallet.topup.payWithCard }),
    ).toBeTruthy();
    expect(screen.queryByTestId('topup-disabled-notice')).toBeNull();
    expectNoLegacyTopupCall();
  });
});

describe('WalletPage history error block (P2-260)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi({ historyFails: true });
  });

  it('is a role=status live region with the no-money-taken reassurance', async () => {
    renderPage();
    const block = await screen.findByTestId('wallet-history-error');
    expect(block.getAttribute('role')).toBe('status');
    expect(within(block).getByText(enMessages.errors.server)).toBeTruthy();
    expect(within(block).getByText(enMessages.errors.noMoneyTaken)).toBeTruthy();
    expect(within(block).getByRole('button', { name: enMessages.common.retry })).toBeTruthy();
  });
});
