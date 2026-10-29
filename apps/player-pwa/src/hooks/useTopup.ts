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
import { fetcher, FetchError } from '@/lib/fetcher';

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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountSar: number; idempotencyKey: string }) =>
      fetcher<TopupIntentResponse>('/wallet/topup/intent', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    // P2-279 (PR-Agent r1 on PR #195): a NEW intent becomes the newest
    // attempt — refetch so the wallet's pending card shows THIS attempt's
    // amount, not the previous one's (stale until refocus without this).
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'topup-latest'] });
    },
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
      // P2-279: a successful verify flips the newest intent to 'credited' —
      // the wallet's last-attempt card must stop showing the pending state.
      void queryClient.invalidateQueries({ queryKey: ['wallet', 'topup-latest'] });
    },
  });
}

// ─── P2-279 (run #176): newest top-up attempt read ──────────────────

export interface LatestTopupIntent {
  id: string;
  /** Exact SAR amount pinned at intent create (server converts halalas). */
  amountSar: number;
  /** 'pending' = unconfirmed (verify never ran/failed); 'credited' = landed. */
  status: 'pending' | 'credited';
  /** ISO-8601 timestamp of the attempt. */
  createdAt: string;
}

export interface LatestTopupIntentResponse {
  intent: LatestTopupIntent | null;
}

/**
 * GET /wallet/topup/latest — the newest attempt for the caller. The wallet
 * page renders an unconfirmed-attempt card only when status === 'pending'
 * (credited attempts already appear as ledger transactions; there is no
 * 'failed' writer — a stuck attempt stays pending).
 */
export function useLatestTopupIntent(params?: { enabled?: boolean }) {
  const { enabled = true } = params ?? {};
  return useQuery<LatestTopupIntentResponse, FetchError>({
    queryKey: ['wallet', 'topup-latest'],
    queryFn: () => fetcher<LatestTopupIntentResponse>('/wallet/topup/latest'),
    staleTime: 30_000,
    retry: false,
    enabled,
  });
}
