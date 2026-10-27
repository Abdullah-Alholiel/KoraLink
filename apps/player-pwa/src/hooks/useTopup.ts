'use client';

/**
 * P0-2 (run #169) — Moyasar wallet top-up hooks.
 *
 * Config drives the wallet page's entry point (enabled = Moyasar flow);
 * intent creation pins the amount server-side; verify credits the wallet
 * after the hosted form completes (on_completed frictionless path).
 * Numeric strings come back from Drizzle `numeric` columns — the caller
 * formats for display.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher } from '@/lib/fetcher';

export interface TopupConfig {
  enabled: boolean;
  publishableKey: string | null;
  minAmount: number;
  maxAmount: number;
}

export interface TopupIntentResponse {
  intent: {
    id: string;
    user_id: string;
    amount_halalas: number;
    currency: string;
    status: string;
    payment_id: string | null;
    idempotency_key: string;
    created_at: string;
    updated_at: string;
  };
  publishableKey: string;
}

export interface TopupVerifyResponse {
  credited: boolean;
  alreadyCredited: boolean;
  balance: string;
  paymentId: string;
  amountSar: number;
}

export function useTopupConfig() {
  return useQuery<TopupConfig>({
    queryKey: ['wallet', 'topup-config'],
    staleTime: 60_000,
    queryFn: () => fetcher('/wallet/topup/config'),
  });
}

export function useCreateTopupIntent() {
  return useMutation({
    mutationFn: (input: { amountSar: number; idempotencyKey: string }) =>
      fetcher<TopupIntentResponse>('/wallet/topup/intent', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useVerifyTopup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { paymentId: string; intentId: string }) =>
      fetcher<TopupVerifyResponse>('/wallet/topup/verify', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'history'] });
    },
  });
}
