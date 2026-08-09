'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { Transaction, PaymentMethod } from '@/types';

// ─── API Response Types ──────────────────────────────

interface WalletBalanceResponse {
  balance: number;
  currency: string;
}

interface WalletHistoryResponse {
  transactions: Transaction[];
  total: number;
  hasMore: boolean;
}

interface PaymentMethodsResponse {
  methods: PaymentMethod[];
}

// ─── Fetch Wallet Balance ───────────────────────────

export function useWalletBalance() {
  return useQuery<WalletBalanceResponse, FetchError>({
    queryKey: ['wallet', 'balance'],
    queryFn: () => fetcher<WalletBalanceResponse>('/wallet/balance'),
  });
}

// ─── Fetch Wallet History ───────────────────────────

export function useWalletHistory() {
  return useQuery<WalletHistoryResponse, FetchError>({
    queryKey: ['wallet', 'history'],
    queryFn: () => fetcher<WalletHistoryResponse>('/wallet/history'),
  });
}

// ─── Fetch Payment Methods ───────────────────────────

export function usePaymentMethods() {
  return useQuery<PaymentMethodsResponse, FetchError>({
    queryKey: ['wallet', 'payment-methods'],
    queryFn: () => fetcher<PaymentMethodsResponse>('/wallet/payment-methods'),
  });
}
