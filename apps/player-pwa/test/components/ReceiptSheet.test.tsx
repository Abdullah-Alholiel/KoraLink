import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import { FetchError } from '@/lib/fetcher';

// jsdom: BottomSheet uses scrollIntoView via its open/close effects.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => {
  // The component + hook do `err instanceof FetchError` — the mock must
  // export the SAME class the test constructs, so define it here.
  class FetchError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly url: string,
    ) {
      super(message);
      this.name = 'FetchError';
    }
  }
  return {
    fetcher: (...args: unknown[]) => mockFetcher(...args),
    FetchError,
  };
});

import ReceiptSheet from '@/components/wallet/ReceiptSheet';
import type { TransactionReceipt } from '@/hooks/useTransactionReceipt';

function makeReceipt(
  overrides: Partial<TransactionReceipt> = {},
): TransactionReceipt {
  return {
    txId: 'a1b2c3d4-0000-0000-0000-000000000000',
    receiptNumber: 'KL-20261114-A1B2C3',
    status: 'Completed',
    direction: 'debit',
    amountSar: 37,
    currency: 'SAR',
    createdAt: '2026-11-14T09:30:00.000Z',
    issuedAt: '2026-11-14T10:00:00.000Z',
    context: {
      kind: 'match',
      matchId: 'm-9',
      matchTitle: 'Sunset 7v7 Rooftop',
      scheduledAt: '2026-11-15T18:00:00.000Z',
      venueName: 'Riyadh Padel Club',
      city: 'Riyadh',
    },
    ...overrides,
  };
}

function renderSheet(open = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <ReceiptSheet
          txId="a1b2c3d4-0000-0000-0000-000000000000"
          open={open}
          onClose={vi.fn()}
          locale="en"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * URL-routed fetcher mock (run-#118 lesson) — route by receipt path so the
 * open-gated query and any refetch stay deterministic.
 */
function routeReceipt(result: TransactionReceipt | Error | 'null') {
  mockFetcher.mockImplementation((url: string) => {
    if (url.startsWith('/wallet/receipt/')) {
      if (result === 'null') return Promise.resolve(null);
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

describe('ReceiptSheet — F5 player transaction receipt (run #206)', () => {
  beforeEach(() => {
    mockFetcher.mockReset();
  });

  it('closed sheet never fetches', () => {
    renderSheet(false);
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it('renders the success body: number, amount, match context, venue', async () => {
    routeReceipt(makeReceipt());
    renderSheet();
    // The number renders twice (detail row + copy-button label).
    expect((await screen.findAllByText('KL-20261114-A1B2C3')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/37\.00/)).toBeInTheDocument();
    expect(screen.getByText('Sunset 7v7 Rooftop')).toBeInTheDocument();
    expect(screen.getByText(/Riyadh Padel Club/)).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    // Request shape: owner-scoped route, no query params.
    expect(mockFetcher).toHaveBeenCalledWith(
      '/wallet/receipt/a1b2c3d4-0000-0000-0000-000000000000',
    );
  });

  it('topup context renders the payment reference and no match fields', async () => {
    routeReceipt(
      makeReceipt({
        direction: 'credit',
        context: { kind: 'topup', paymentId: 'pay_moyasar_123' },
      }),
    );
    renderSheet();
    expect(await screen.findByText('pay_moyasar_123')).toBeInTheDocument();
    expect(screen.queryByText('Sunset 7v7 Rooftop')).not.toBeInTheDocument();
    expect(screen.getByText('Wallet top-up')).toBeInTheDocument();
  });

  it('404 → "unavailable" copy, NOT an error state', async () => {
    routeReceipt('null');
    renderSheet();
    expect(
      await screen.findByTestId('receipt-unavailable'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('receipt-error')).not.toBeInTheDocument();
  });

  it('classified error renders retry and never shows raw err.message', async () => {
    routeReceipt(new FetchError('boom', 500, '/wallet/receipt/x'));
    renderSheet();
    expect(await screen.findByTestId('receipt-error')).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try Again' }),
    ).toBeInTheDocument();
  });

  it('share button renders only where navigator.share exists (no dead UI)', async () => {
    routeReceipt(makeReceipt());
    const originalShare = navigator.share;
    try {
      // Present → button renders.
      Object.defineProperty(navigator, 'share', {
        value: vi.fn().mockResolvedValue(undefined),
        configurable: true,
      });
      const first = renderSheet();
      await screen.findAllByText('KL-20261114-A1B2C3');
      expect(screen.getByRole('button', { name: 'Share receipt' })).toBeInTheDocument();
      first.unmount();

      // Absent → button never renders (progressive enhancement).
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        configurable: true,
      });
      renderSheet();
      await screen.findAllByText('KL-20261114-A1B2C3');
      expect(
        screen.queryByRole('button', { name: 'Share receipt' }),
      ).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, 'share', {
        value: originalShare,
        configurable: true,
      });
    }
  });
});
