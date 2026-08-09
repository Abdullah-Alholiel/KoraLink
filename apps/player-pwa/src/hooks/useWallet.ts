'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { Transaction, PaymentMethod } from '@/types';
import {
  type TransactionApi,
  type WalletBalanceApi,
  adaptTransactionList,
  adaptWalletBalance,
} from '@/lib/api-adapter';

// ─── Fetch Wallet Balance ───────────────────────────

export function useWalletBalance() {
  return useQuery<{ balance: number; currency: string }, FetchError>({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => {
      const raw = await fetcher<WalletBalanceApi>('/wallet/balance');
      return { balance: adaptWalletBalance(raw), currency: 'SAR' };
    },
  });
}

// ─── Fetch Wallet History ───────────────────────────

export function useWalletHistory() {
  return useQuery<{ transactions: Transaction[] }, FetchError>({
    queryKey: ['wallet', 'history'],
    queryFn: async () => {
      // API returns array of transaction rows
      const raw = await fetcher<TransactionApi[]>('/wallet/history');
      return { transactions: adaptTransactionList(raw) };
    },
  });
}

// ─── Fetch Payment Methods ───────────────────────────

export function usePaymentMethods() {
  return useQuery<{ methods: PaymentMethod[] }, FetchError>({
    queryKey: ['wallet', 'payment-methods'],
    queryFn: () => fetcher<{ methods: PaymentMethod[] }>('/wallet/payment-methods'),
  });
}
