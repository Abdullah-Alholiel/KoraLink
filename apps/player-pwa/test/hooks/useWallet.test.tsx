import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import React from 'react';

// Mock fetcher
const mockFetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  FetchError: class FetchError extends Error {
    status: number;
    url: string;
    constructor(msg: string, status: number, url: string) {
      super(msg);
      this.name = 'FetchError';
      this.status = status;
      this.url = url;
    }
  },
}));

import {
  useWalletBalance,
  useWalletHistory,
  useTopupWallet,
  useFetchAllWalletHistory,
} from '@/hooks/useWallet';

// Wrapper with QueryClientProvider (+ NextIntl — useLocale() in the hooks)
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <NextIntlClientProvider messages={enMessages} locale="en">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </NextIntlClientProvider>
    ),
    queryClient,
  };
}

// Helper: build API-shaped transaction row
function makeApiTransaction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'txn_1',
    user_id: 'u1',
    type: 'DEBIT' as const,
    amount: '45.00',
    reference_type: 'MATCH_FEE' as const,
    reference_id: 'ref1',
    idempotency_key: 'ik1',
    status: 'Completed' as const,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Helper: controllable promise for asserting optimistic (in-flight) state
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useWallet hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useWalletBalance', () => {
    it('fetches wallet balance from /wallet/balance', async () => {
      // API returns string balance
      const apiBalance = { balance: '150.00' };
      mockFetcher.mockResolvedValue(apiBalance);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/wallet/balance');
      // Adapted: string → number
      expect(result.current.data).toEqual({ balance: 150, currency: 'SAR' });
    });

    it('handles network error', async () => {
      mockFetcher.mockRejectedValue(new Error('Network error'));

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletBalance(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('useWalletHistory', () => {
    it('fetches transaction history from /wallet/history', async () => {
      const apiTxn = makeApiTransaction();
      mockFetcher.mockResolvedValue({ transactions: [apiTxn], total: 1, hasMore: false });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletHistory(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // P2-15: paging params are ALWAYS sent and are part of the query key.
      expect(mockFetcher).toHaveBeenCalledWith('/wallet/history', {
        params: { page: '1', perPage: '20' },
      });
      expect(result.current.data?.transactions).toHaveLength(1);
      const txn = result.current.data!.transactions[0];
      expect(txn.id).toBe('txn_1');
      expect(txn.type).toBe('debit');
      expect(txn.category).toBe('match_payment');
      expect(txn.amount).toBe(45);
      expect(txn.currency).toBe('SAR');
    });

    it('sends page 2 params when asked (query key varies by page)', async () => {
      mockFetcher.mockResolvedValue({ transactions: [], total: 0, hasMore: false });

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useWalletHistory({ page: 2, perPage: 50 }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/wallet/history', {
        params: { page: '2', perPage: '50' },
      });
    });

    it('handles empty transaction history', async () => {
      mockFetcher.mockResolvedValue({ transactions: [], total: 0, hasMore: false });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletHistory(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.transactions).toHaveLength(0);
    });

    it('adapts CREDIT transactions correctly', async () => {
      const apiTxn = makeApiTransaction({
        type: 'CREDIT',
        amount: '200.00',
        reference_type: 'TOPUP',
      });
      mockFetcher.mockResolvedValue({ transactions: [apiTxn], total: 1, hasMore: false });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletHistory(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const txn = result.current.data!.transactions[0];
      expect(txn.type).toBe('credit');
      expect(txn.category).toBe('topup');
      expect(txn.amount).toBe(200);
    });

    // P2-207: locale renders the cached descriptions, so it MUST be part of
    // the query key — an ar↔en switch must produce a fresh fetch, never the
    // old locale's strings from cache (staleTime window).
    it('does not reuse a locale-less legacy cache entry (locale is part of the key)', async () => {
      const apiTxn = makeApiTransaction();
      mockFetcher.mockResolvedValue({ transactions: [apiTxn], total: 1, hasMore: false });

      const { wrapper, queryClient } = createWrapper();

      // Seed the cache the way a PRE-FIX en session would have: the legacy
      // locale-less key shape. The hook (new shape, locale:'en') must treat
      // it as a DIFFERENT entry and fetch fresh.
      queryClient.setQueryData(
        ['wallet', 'history', { page: 1, perPage: 20, from: undefined, to: undefined }],
        { transactions: [], total: 0, hasMore: false },
      );

      const { result } = renderHook(() => useWalletHistory(), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // The fetch happened despite a populated legacy entry — keys differ.
      expect(mockFetcher).toHaveBeenCalledWith('/wallet/history', {
        params: { page: '1', perPage: '20' },
      });
      // And the data came from the fetch, not the seeded legacy entry.
      expect(result.current.data?.transactions).toHaveLength(1);
      // The locale-carrying entry is now the one in the cache.
      expect(queryClient.getQueryData(['wallet', 'history', { page: 1, perPage: 20, from: undefined, to: undefined, locale: 'en' }])).toBeDefined();
    });

    it('serves a warm same-locale entry without refetching (cache still works)', async () => {
      mockFetcher.mockResolvedValue({ transactions: [], total: 0, hasMore: false });
      const { wrapper, queryClient } = createWrapper();

      const { result } = renderHook(() => useWalletHistory(), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const enFetchCount = mockFetcher.mock.calls.length;

      // A second mount with the same args + same locale hits the cache —
      // adding locale to the key did not break caching, only cross-locale
      // collisions.
      const { result: result2 } = renderHook(() => useWalletHistory(), { wrapper });
      await waitFor(() => expect(result2.current.isSuccess).toBe(true));
      expect(mockFetcher.mock.calls.length).toBe(enFetchCount);
      expect(queryClient.getQueryData(['wallet', 'history', { page: 1, perPage: 20, from: undefined, to: undefined, locale: 'en' }])).toBeDefined();
    });
  });

  // P2-207 second half: the CSV export path previously called
  // fetchWalletHistoryPage WITHOUT locale → adaptTransactionList defaulted
  // to 'en', so Arabic users exported EN clock strings. The hook now reads
  // useLocale() and exports carry the active locale's rendering.
  describe('useFetchAllWalletHistory (export)', () => {
    it('exports through the locale-carrying cache key (en wrapper)', async () => {
      mockFetcher.mockResolvedValue({
        transactions: [makeApiTransaction()],
        total: 1,
        hasMore: false,
      });

      const { wrapper, queryClient } = createWrapper();
      const { result } = renderHook(() => useFetchAllWalletHistory(), { wrapper });

      let out: { rows: unknown[]; truncated: boolean } | undefined;
      await act(async () => {
        out = await result.current({ from: '2026-01-01', to: '2026-01-31' });
      });

      expect(out!.rows).toHaveLength(1);
      expect(out!.truncated).toBe(false);
      expect(mockFetcher).toHaveBeenCalledWith('/wallet/history', {
        params: { page: '1', perPage: '100', from: '2026-01-01', to: '2026-01-31' },
      });
      // The export populated the LOCALE-CARRYING key — proof the fix is in
      // the fetch path, not just the screen hook.
      expect(
        queryClient.getQueryData([
          'wallet',
          'history',
          { page: 1, perPage: 100, from: '2026-01-01', to: '2026-01-31', locale: 'en' },
        ]),
      ).toBeDefined();
    });

    it('renders AR clock strings in exported rows under an ar session', async () => {
      // Riyadh = UTC+3 fixed; 10:00Z = 13:00 wall = PM year-round (same
      // deterministic oracle as test/lib/adapter-clock-locale.test.ts —
      // never assert meridiem off `new Date()`; that flakes at night).
      mockFetcher.mockResolvedValue({
        transactions: [makeApiTransaction({ created_at: '2026-10-15T10:00:00.000Z' })],
        total: 1,
        hasMore: false,
      });
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const arWrapper = ({ children }: { children: React.ReactNode }) => (
        <NextIntlClientProvider messages={enMessages} locale="ar">
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </NextIntlClientProvider>
      );

      const { result } = renderHook(() => useFetchAllWalletHistory(), { wrapper: arWrapper });
      let out: { rows: { description: string }[]; truncated: boolean } | undefined;
      await act(async () => {
        out = await result.current({});
      });

      // Arabic-Indic digits prove the AR path ran (the legacy bug exported
      // Latin "7:30 PM • Completed"). Meridiem itself is TZ-dependent —
      // never asserted; digits + Completed are the locale oracle.
      expect(out!.rows[0].description).toMatch(/[\u0660-\u0669]/);
      expect(out!.rows[0].description).toContain('• Completed');
      expect(
        queryClient.getQueryData([
          'wallet',
          'history',
          { page: 1, perPage: 100, from: undefined, to: undefined, locale: 'ar' },
        ]),
      ).toBeDefined();
    });
  });

  describe('useTopupWallet', () => {
    it('POSTs topup data to /wallet/topup', async () => {
      const mockResponse = {
        ledgerEntry: { id: 'txn_new', type: 'CREDIT', amount: '100.00' },
        wallet_balance: '250.00',
      };
      mockFetcher.mockResolvedValue(mockResponse);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTopupWallet(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          amount: 100,
          idempotencyKey: 'test-key-001',
        });
      });

      expect(mockFetcher).toHaveBeenCalledWith('/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amount: 100, idempotencyKey: 'test-key-001' }),
      });
    });

    it('optimistically credits the balance and rolls back on failure', async () => {
      const { wrapper, queryClient } = createWrapper();
      queryClient.setQueryData(['wallet', 'balance'], { balance: 100, currency: 'SAR' });

      const d = deferred<unknown>();
      mockFetcher.mockReturnValue(d.promise);

      const { result } = renderHook(() => useTopupWallet(), { wrapper });

      act(() => {
        result.current.mutate({ amount: 50, idempotencyKey: 'ik-opt' });
      });

      // Optimistic credit is visible while the request is still in flight.
      await waitFor(() =>
        expect(queryClient.getQueryData(['wallet', 'balance'])).toEqual({
          balance: 150,
          currency: 'SAR',
        }),
      );

      await act(async () => {
        d.reject(new Error('payment failed'));
      });
      await waitFor(() => expect(result.current.isError).toBe(true));

      // Rolled back to the pre-mutation balance.
      await waitFor(() =>
        expect(queryClient.getQueryData(['wallet', 'balance'])).toEqual({
          balance: 100,
          currency: 'SAR',
        }),
      );
    });
  });
});
