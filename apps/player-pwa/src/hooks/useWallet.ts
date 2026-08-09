'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { Transaction } from '@/types';
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
      const raw = await fetcher<{ transactions: TransactionApi[]; total: number; hasMore: boolean }>('/wallet/history');
      return { transactions: adaptTransactionList(raw.transactions) };
    },
  });
}

// ─── Top Up Wallet ──────────────────────────────

export function useTopupWallet() {
  const queryClient = useQueryClient();

  return useMutation<
    { ledgerEntry: unknown; wallet_balance: string },
    FetchError,
    { amount: number; idempotencyKey: string; referenceId?: string }
  >({
    mutationFn: (data) =>
      fetcher('/wallet/topup', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet', 'history'] });
    },
  });
}

// ─── Pay from Wallet ──────────────────────────────

export function usePayWallet() {
  const queryClient = useQueryClient();

  return useMutation<
    { ledgerEntry: unknown; wallet_balance: string },
    FetchError,
    { amount: number; idempotencyKey: string; referenceId?: string }
  >({
    mutationFn: (data) =>
      fetcher('/wallet/pay', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet', 'history'] });
    },
  });
}
