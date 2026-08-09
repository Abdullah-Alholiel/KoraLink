import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  usePaymentMethods,
} from '@/hooks/useWallet';

// Wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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
      mockFetcher.mockResolvedValue([apiTxn]);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletHistory(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/wallet/history');
      expect(result.current.data?.transactions).toHaveLength(1);
      const txn = result.current.data!.transactions[0];
      expect(txn.id).toBe('txn_1');
      expect(txn.type).toBe('debit');
      expect(txn.category).toBe('match_payment');
      expect(txn.amount).toBe(45);
      expect(txn.currency).toBe('SAR');
    });

    it('handles empty transaction history', async () => {
      mockFetcher.mockResolvedValue([]);

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
      mockFetcher.mockResolvedValue([apiTxn]);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletHistory(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const txn = result.current.data!.transactions[0];
      expect(txn.type).toBe('credit');
      expect(txn.category).toBe('topup');
      expect(txn.amount).toBe(200);
    });
  });

  describe('usePaymentMethods', () => {
    it('fetches payment methods from /wallet/payment-methods', async () => {
      const mockMethods = {
        methods: [
          {
            id: 'pm_1',
            type: 'card',
            last4: '4242',
            brand: 'visa',
            isDefault: true,
          },
        ],
      };
      mockFetcher.mockResolvedValue(mockMethods);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => usePaymentMethods(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/wallet/payment-methods');
      expect(result.current.data).toEqual(mockMethods);
    });
  });
});
