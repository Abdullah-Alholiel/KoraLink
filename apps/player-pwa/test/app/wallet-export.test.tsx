import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import enMessages from '@/messages/en.json';
import WalletPage from '@/app/[locale]/(main)/wallet/page';
import { useAppStore } from '@/store/useAppStore';
import {
  WALLET_CSV_HEADER,
  buildWalletCsv,
  escapeCsvField,
  toIsoDateRange,
  walletCsvFilename,
} from '@/lib/wallet-csv';
import type { Transaction } from '@/types';

// ── P2-119: wallet transaction history CSV export + date-range filter.

const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  FetchError: class FetchError extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/en/wallet',
}));

const downloadTextAsFile = vi.fn();
vi.mock('@/lib/download', () => ({
  downloadTextAsFile: (...args: unknown[]) => downloadTextAsFile(...args),
}));

const FIXTURE: Transaction[] = [
  {
    id: 'txn_1',
    type: 'debit',
    category: 'match_payment',
    title: 'Match "Friday Night", Olaya',
    description: 'line one\nline two',
    amount: 45,
    currency: 'SAR',
    createdAt: '2026-09-20T18:30:00.000Z',
    icon: 'match',
  },
  {
    id: 'txn_2',
    type: 'credit',
    category: 'topup',
    title: 'Wallet Top Up',
    description: '10:00 AM • Completed',
    amount: 200,
    currency: 'SAR',
    createdAt: '2026-09-19T07:00:00.000Z',
    icon: 'wallet',
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider messages={enMessages} locale="en">
        <WalletPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function apiRow(id: string) {
  return {
    id,
    user_id: 'user-1',
    type: 'DEBIT',
    amount: '45.00',
    reference_type: 'MATCH_FEE',
    reference_id: 'match-123456789',
    idempotency_key: `k-${id}`,
    status: 'Completed',
    created_at: '2026-09-20T18:30:00.000Z',
  };
}

describe('wallet CSV builder (P2-119)', () => {
  it('emits the header line and properly escaped rows', () => {
    const csv = buildWalletCsv(FIXTURE);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Date,Type,Category,Title,Description,Amount,Currency');
    expect(lines[0]).toBe(WALLET_CSV_HEADER.join(','));
    // quotes doubled, comma + newline fields wrapped in quotes
    expect(csv).toContain(
      '2026-09-20T18:30:00.000Z,debit,match_payment,"Match ""Friday Night"", Olaya","line one\nline two",45.00,SAR\r\n',
    );
    expect(csv).toContain(
      '2026-09-19T07:00:00.000Z,credit,topup,Wallet Top Up,10:00 AM • Completed,200.00,SAR\r\n',
    );
  });

  it('escapeCsvField leaves plain values untouched', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a"b')).toBe('"a""b"');
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"');
  });

  it('filename follows koralink-wallet-YYYYMMDD-HHmm.csv', () => {
    expect(walletCsvFilename(new Date(2026, 8, 5, 7, 3))).toBe(
      'koralink-wallet-20260905-0703.csv',
    );
  });

  it('toIsoDateRange flags inverted ranges and allows open ends', () => {
    expect(toIsoDateRange('2026-09-10', '2026-09-01').inverted).toBe(true);
    expect(toIsoDateRange('2026-09-01', '2026-09-01').inverted).toBe(false);
    const open = toIsoDateRange('', '');
    expect(open).toEqual({ from: undefined, to: undefined, inverted: false });
  });
});

describe('WalletPage — export sheet (P2-119)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ toast: null } as never);
    mockFetcher.mockImplementation(async (path: string) => {
      if (path === '/wallet/balance') return { balance: '100.00' };
      return { transactions: [], total: 0, hasMore: false };
    });
  });

  it('renders the Export action and opens the sheet', async () => {
    renderPage();
    const btn = screen.getByRole('button', { name: enMessages.wallet.export });
    fireEvent.click(btn);
    expect(await screen.findByText(enMessages.wallet.exportTitle)).toBeTruthy();
    expect(screen.getByText(enMessages.wallet.exportCsv)).toBeTruthy();
  });

  it('an inverted date range shows a validation error and fetches nothing', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: enMessages.wallet.export }));
    await screen.findByText(enMessages.wallet.exportTitle);
    const inputs = document.body.querySelectorAll('input[type="date"]');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: '2026-09-10' } });
    fireEvent.change(inputs[1], { target: { value: '2026-09-01' } });
    mockFetcher.mockClear();
    fireEvent.click(screen.getByText(enMessages.wallet.exportCsv));
    expect(await screen.findByText(enMessages.wallet.exportInvalidRange)).toBeTruthy();
    expect(mockFetcher).not.toHaveBeenCalled();
    expect(downloadTextAsFile).not.toHaveBeenCalled();
  });

  it('empty result shows the exportEmpty toast and does not download', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: enMessages.wallet.export }));
    fireEvent.click(await screen.findByText(enMessages.wallet.exportCsv));
    await waitFor(() =>
      expect(useAppStore.getState().toast?.message).toBe(enMessages.wallet.exportEmpty),
    );
    expect(downloadTextAsFile).not.toHaveBeenCalled();
  });

  it('pages until hasMore=false, sends the range, and downloads the CSV', async () => {
    mockFetcher.mockImplementation(async (path: string, opts?: { params?: Record<string, string> }) => {
      if (path === '/wallet/balance') return { balance: '100.00' };
      const page = opts?.params?.page;
      if (opts?.params?.perPage !== '100') return { transactions: [], total: 0, hasMore: false };
      return page === '1'
        ? { transactions: [apiRow('a')], total: 2, hasMore: true }
        : { transactions: [apiRow('b')], total: 2, hasMore: false };
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: enMessages.wallet.export }));
    await screen.findByText(enMessages.wallet.exportTitle);
    const inputs = document.body.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByText(enMessages.wallet.exportCsv));

    await waitFor(() => expect(downloadTextAsFile).toHaveBeenCalledTimes(1));
    const exportCalls = mockFetcher.mock.calls.filter(
      ([p, o]) => p === '/wallet/history' && o?.params?.perPage === '100',
    );
    expect(exportCalls).toHaveLength(2);
    expect(exportCalls[0][1].params.from).toBe(toIsoDateRange('2026-09-01', '').from);
    expect(exportCalls[0][1].params.to).toBeUndefined();

    const [text, filename, mime] = downloadTextAsFile.mock.calls[0];
    expect(text).toContain('Date,Type,Category,Title,Description,Amount,Currency');
    expect((text as string).split('\r\n').filter(Boolean)).toHaveLength(3);
    expect(filename).toMatch(/^koralink-wallet-\d{8}-\d{4}\.csv$/);
    expect(mime).toContain('text/csv');
    expect(useAppStore.getState().toast?.message).toBe(enMessages.wallet.exportSuccess);
  });

  it('a failed fetch shows the localized exportFailed toast', async () => {
    mockFetcher.mockImplementation(async (path: string, opts?: { params?: Record<string, string> }) => {
      if (path === '/wallet/balance') return { balance: '100.00' };
      if (opts?.params?.perPage === '100') throw new Error('boom');
      return { transactions: [], total: 0, hasMore: false };
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: enMessages.wallet.export }));
    fireEvent.click(await screen.findByText(enMessages.wallet.exportCsv));
    await waitFor(() =>
      expect(useAppStore.getState().toast?.message).toBe(
        `${enMessages.errors.exportFailed} ${enMessages.errors.exportFailedDetail}`,
      ),
    );
    expect(useAppStore.getState().toast?.type).toBe('error');
    expect(downloadTextAsFile).not.toHaveBeenCalled();
  });
});
