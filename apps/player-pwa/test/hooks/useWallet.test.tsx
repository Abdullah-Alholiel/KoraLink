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

describe('useWallet hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useWalletBalance', () => {
    it('fetches wallet balance from /wallet/balance', async () => {
      const mockBalance = { balance: 150.0, currency: 'SAR' };
      mockFetcher.mockResolvedValue(mockBalance);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/wallet/balance');
      expect(result.current.data).toEqual(mockBalance);
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
      const mockHistory = {
        transactions: [
          {
            id: 'txn_1',
            type: 'debit',
            category: 'match_payment',
            title: 'Test Match',
            description: 'Payment successful',
            amount: 45.0,
            currency: 'SAR',
            createdAt: new Date().toISOString(),
            icon: 'match',
          },
        ],
        total: 1,
        hasMore: false,
      };
      mockFetcher.mockResolvedValue(mockHistory);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletHistory(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetcher).toHaveBeenCalledWith('/wallet/history');
      expect(result.current.data).toEqual(mockHistory);
    });

    it('handles empty transaction history', async () => {
      mockFetcher.mockResolvedValue({
        transactions: [],
        total: 0,
        hasMore: false,
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWalletHistory(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.transactions).toHaveLength(0);
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
