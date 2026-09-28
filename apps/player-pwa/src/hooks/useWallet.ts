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

export function useWalletBalance(params?: { enabled?: boolean }) {
  const { enabled = true } = params ?? {};
  return useQuery<{ balance: number; currency: string }, FetchError>({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => {
      const raw = await fetcher<WalletBalanceApi>('/wallet/balance');
      return { balance: adaptWalletBalance(raw), currency: 'SAR' };
    },
    staleTime: 60_000,
    retry: false,
    enabled,
  });
}

// ─── Fetch Wallet History ───────────────────────────

export type WalletHistoryParams = {
  page?: number;
  perPage?: number;
  /** Inclusive ISO-8601 lower bound on created_at (P2-119). */
  from?: string;
  /** Inclusive ISO-8601 upper bound on created_at (P2-119). */
  to?: string;
};

export type WalletHistoryPage = {
  transactions: Transaction[];
  total?: number;
  hasMore?: boolean;
};

type WalletHistoryArgs = Required<Pick<WalletHistoryParams, 'page' | 'perPage'>> &
  WalletHistoryParams;

function walletHistoryKey({ page, perPage, from, to }: WalletHistoryArgs) {
  // P2-15: the key MUST carry every filter (page/perPage/from/to) — a bare
  // ['wallet','history'] cached page 1 forever and changing it never refetched.
  return ['wallet', 'history', { page, perPage, from, to }] as const;
}

async function fetchWalletHistoryPage({
  page,
  perPage,
  from,
  to,
}: WalletHistoryArgs): Promise<WalletHistoryPage> {
  const params: Record<string, string> = { page: String(page), perPage: String(perPage) };
  if (from) params.from = from;
  if (to) params.to = to;
  const raw = await fetcher<{
    transactions: TransactionApi[];
    total: number;
    hasMore: boolean;
  }>('/wallet/history', { params });
  return {
    transactions: adaptTransactionList(raw.transactions),
    total: raw.total,
    hasMore: raw.hasMore,
  };
}

export function useWalletHistory(params?: WalletHistoryParams) {
  const { page = 1, perPage = 20, from, to } = params ?? {};
  return useQuery<WalletHistoryPage, FetchError>({
    queryKey: walletHistoryKey({ page, perPage, from, to }),
    queryFn: () => fetchWalletHistoryPage({ page, perPage, from, to }),
    staleTime: 60_000,
    retry: false,
  });
}

/** Safety cap on pages fetched for a single export (100 × 20 = 2,000 rows). */
export const WALLET_EXPORT_MAX_PAGES = 20;

/**
* P2-119: imperatively collects every history page (perPage 100) for an
* optional range until hasMore=false. Pages go through the same query key
* as useWalletHistory so they share the React Query cache.
*/
export function useFetchAllWalletHistory() {
  const queryClient = useQueryClient();
  return async (range: { from?: string; to?: string }): Promise<Transaction[]> => {
    const perPage = 100;
    const all: Transaction[] = [];
    for (let page = 1; page <= WALLET_EXPORT_MAX_PAGES; page++) {
      const args = { page, perPage, from: range.from, to: range.to };
      const data = await queryClient.fetchQuery<WalletHistoryPage, FetchError>({
        queryKey: walletHistoryKey(args),
        queryFn: () => fetchWalletHistoryPage(args),
        staleTime: 60_000,
      });
      all.push(...data.transactions);
      if (!data.hasMore) break;
    }
    return all;
  };
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

// ─── Pay from Wallet — REMOVED (run #58) ─────────────────────────
// usePayWallet deleted: it called the removed POST /wallet/pay endpoint
// (client-supplied amount for a MATCH_FEE debit — no server-side pricing).
// Match fees are charged server-side inside joinMatch (in-tx, server price).
// Had zero consumers. See docs/plans/run58-review-sweep/00-retro.md.
