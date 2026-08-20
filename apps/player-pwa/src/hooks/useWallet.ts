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
    staleTime: 60_000,
    retry: false,
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
    staleTime: 60_000,
    retry: false,
  });
}

// ─── Top Up Wallet ──────────────────────────────

type WalletBalanceShape = { balance: number; currency: string };
type TopupMutationContext = { previous: WalletBalanceShape | undefined };

export function useTopupWallet() {
  const queryClient = useQueryClient();

  return useMutation<
    { ledgerEntry: unknown; wallet_balance: string },
    FetchError,
    { amount: number; idempotencyKey: string; referenceId?: string },
    TopupMutationContext
  >({
    mutationFn: (data) =>
      fetcher('/wallet/topup', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onMutate: async ({ amount }) => {
      // Optimistically credit the balance (top-up is a credit, so a brief
      // incorrect balance on failure is low-risk and rolled back below).
      await queryClient.cancelQueries({ queryKey: ['wallet', 'balance'] });
      const previous = queryClient.getQueryData<WalletBalanceShape>(['wallet', 'balance']);
      queryClient.setQueryData<WalletBalanceShape>(['wallet', 'balance'], (old) =>
        old ? { ...old, balance: old.balance + amount } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['wallet', 'balance'], context.previous);
      }
    },
    onSuccess: (data) => {
      // Reconcile to the authoritative server balance, then refetch history.
      queryClient.setQueryData<WalletBalanceShape>(['wallet', 'balance'], {
        balance: Number(data.wallet_balance),
        currency: 'SAR',
      });
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
