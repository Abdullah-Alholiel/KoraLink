import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import HostPayoutReceipt from '@/components/matches/HostPayoutReceipt';
import { fetcher, FetchError } from '@/lib/fetcher';

/**
 * P2-293 (run #185) — HostPayoutReceipt tripwires:
 * (1) NON-hosts / non-completed matches never fetch and never render;
 * (2) the completing host sees the real math (fee pool, platform fee,
 *     forfeits, total) with localized money;
 * (3) a 404 (payout not released / not owner) renders NOTHING — a missing
 *     receipt must not surface an error on a money surface.
 */

vi.mock('@/lib/fetcher', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/fetcher')>();
  return {
    ...actual,
    fetcher: vi.fn(),
    clearAuthToken: vi.fn(),
  };
});

const mockedFetcher = vi.mocked(fetcher);

const RECEIPT = {
  matchId: 'm-1',
  matchTitle: 'Sunset 7v7 Rooftop',
  completedAt: '2026-11-04T10:00:00.000Z',
  currency: 'SAR' as const,
  payoutSar: 57,
  forfeitSar: 5,
  forfeits: 1,
  totalCreditedSar: 62,
  breakdown: {
    feePoolSar: 72,
    payers: 3,
    platformFeeSar: 15,
    perJoinerFeeSar: 5,
  },
};

function renderCard(props?: Partial<Parameters<typeof HostPayoutReceipt>[0]>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <HostPayoutReceipt
          matchId="m-1"
          isUserHost
          isPlayerHosted
          matchStatus="completed"
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedFetcher.mockReset();
});

describe('HostPayoutReceipt — P2-293', () => {
  it('non-host or non-completed: never fetches, never renders', () => {
    renderCard({ isUserHost: false });
    expect(mockedFetcher).not.toHaveBeenCalled();
    expect(screen.queryByText('Payout receipt')).not.toBeInTheDocument();

    renderCard({ matchStatus: 'in_progress' });
    expect(mockedFetcher).not.toHaveBeenCalled();

    renderCard({ isPlayerHosted: false });
    expect(mockedFetcher).not.toHaveBeenCalled();
  });

  it('completing host: renders the full breakdown with the released math', async () => {
    mockedFetcher.mockResolvedValue(RECEIPT);
    renderCard();

    await waitFor(() =>
      expect(screen.getByText('Payout receipt')).toBeInTheDocument(),
    );
    expect(screen.getByText('Joiner fees (3 players)')).toBeInTheDocument();
    expect(screen.getByText('Platform fee (SAR 5.00 × 3)')).toBeInTheDocument();
    expect(screen.getByText('Forfeited fees (1 player)')).toBeInTheDocument();
    expect(screen.getByText('Total credited')).toBeInTheDocument();
    expect(screen.getByText('SAR 62.00')).toBeInTheDocument();
  });

  it('404 (not released / not owner): renders nothing, no error UI', async () => {
    mockedFetcher.mockRejectedValue(new FetchError('API 404', 404, '/wallet/payout-receipt/m-1'));
    const { container } = renderCard();

    await waitFor(() => expect(mockedFetcher).toHaveBeenCalled());
    await waitFor(() => {
      // The loading hint resolves away and the card stays hidden.
      expect(screen.queryByText(/Checking your payout/)).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Payout receipt')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  it('network error (non-404): card stays hidden too (money-truth: never guess)', async () => {
    mockedFetcher.mockRejectedValue(new FetchError('boom', 500, '/wallet/payout-receipt/m-1'));
    const { container } = renderCard();

    await waitFor(() => {
      expect(screen.queryByText(/Checking your payout/)).not.toBeInTheDocument();
    });
    expect(container.textContent).toBe('');
  });

  it('zero forfeits: the forfeit line is omitted', async () => {
    mockedFetcher.mockResolvedValue({ ...RECEIPT, forfeitSar: 0, forfeits: 0, totalCreditedSar: 57 });
    renderCard();

    await waitFor(() =>
      expect(screen.getByText('Payout receipt')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Forfeited fees/)).not.toBeInTheDocument();
  });
});
