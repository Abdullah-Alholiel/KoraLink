'use client';

/**
 * F5 (run #206, D-20261106-13) — player transaction receipt hook.
 *
 * Fetches GET /wallet/receipt/:txId for any ledger row the user owns
 * (top-up credit, match-fee debit, refund credit, …). A 404 (row gone /
 * not the owner) resolves to `null` so the receipt sheet shows
 * "unavailable" copy instead of an error — the same
 * missing-receipt-is-not-an-error doctrine as usePayoutReceipt.
 */
import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

export type TransactionReceiptContext =
  | {
      kind: 'match';
      matchId: string;
      matchTitle: string;
      scheduledAt: string | null;
      venueName: string | null;
      city: string | null;
    }
  | { kind: 'topup'; paymentId: string | null }
  | { kind: 'generic' };

export interface TransactionReceipt {
  txId: string;
  /** KL-<yyyyMMdd>-<first12 of tx id> — deterministic, no schema column. */
  receiptNumber: string;
  status: 'Pending' | 'Completed' | 'Failed' | 'Reversed';
  direction: 'credit' | 'debit';
  amountSar: number;
  currency: 'SAR';
  createdAt: string;
  issuedAt: string;
  context: TransactionReceiptContext;
}

export function useTransactionReceipt(txId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['wallet', 'receipt', txId],
    queryFn: async (): Promise<TransactionReceipt | null> => {
      try {
        return await fetcher<TransactionReceipt>(`/wallet/receipt/${txId}`);
      } catch (err) {
        if (err instanceof FetchError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: enabled && !!txId,
    staleTime: 60_000,
    retry: false,
  });
}
