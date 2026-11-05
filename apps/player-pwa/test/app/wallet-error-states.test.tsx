import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import WalletPage from '@/app/[locale]/(main)/wallet/page';
import { useAppStore } from '@/store/useAppStore';

// ── P2-260: wallet actions distinguish offline from failed (error-message
// standard). Offline → "reconnect and try again" (no reassurance: the request
// never left the device); 403 → production-gated copy; anything else →
// generic failure + "no money was taken". The history error block is a
// role=status live region carrying the same money-surface reassurance.

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

const mockTopup = vi.fn();
vi.mock('@/hooks/useWallet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useWallet')>();
  return {
    ...actual,
    useTopupWallet: () =>
      useMutation({
        mutationFn: (vars: { amount: number; idempotencyKey: string }) => mockTopup(vars),
      }),
  };
});

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

function mockApi(opts: { historyFails?: boolean } = {}) {
  mockFetcher.mockImplementation(async (path: string) => {
    if (path === '/wallet/balance') return { balance: '100.00' };
    if (path === '/wallet/topup/config') return { enabled: false, minAmount: 5, maxAmount: 2000 };
    if (path.startsWith('/wallet/history') || path.startsWith('/wallet/transactions')) {
      if (opts.historyFails) throw Object.assign(new Error('x'), { status: 500 });
      return { transactions: [], total: 0, hasMore: false };
    }
    return { transactions: [], total: 0, hasMore: false };
  });
}

async function submitTopup() {
  renderPage();
  // Open the legacy (flag-off) top-up sheet via the quick-action button.
  const openers = await screen.findAllByRole('button', { name: enMessages.wallet.topUp });
  fireEvent.click(openers[0]);
  const input = await screen.findByPlaceholderText('0');
  fireEvent.change(input, { target: { value: '50' } });
  const submit = screen
    .getAllByRole('button', { name: enMessages.wallet.topUp })
    .find((b) => !b.hasAttribute('disabled') && b.className.includes('w-full'));
  expect(submit).toBeTruthy();
  fireEvent.click(submit!);
}

describe('WalletPage top-up onError classification (P2-260)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ toast: null } as never);
    mockApi();
  });

  const cases: Array<[string, Error, string, boolean]> = [
    ['status 0', Object.assign(new Error('x'), { status: 0 }), enMessages.errors.offlineTryAgain, false],
    ['network-shaped message', new TypeError('Failed to fetch'), enMessages.errors.offlineTryAgain, false],
    ['status 403', Object.assign(new Error('x'), { status: 403 }), enMessages.wallet.topupDisabled, false],
    ['status 500', Object.assign(new Error('x'), { status: 500 }), enMessages.errors.walletTopupFailed, true],
  ];

  it.each(cases)('%s → correct copy', async (_label, err, expected, reassure) => {
    mockTopup.mockRejectedValue(err);
    await submitTopup();
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(within(alert).getByText(expected)).toBeTruthy());
    expect(mockTopup).toHaveBeenCalledTimes(1);
    const reassurance = within(alert).queryByText(enMessages.errors.noMoneyTaken);
    if (reassure) expect(reassurance).toBeTruthy();
    else expect(reassurance).toBeNull();
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
