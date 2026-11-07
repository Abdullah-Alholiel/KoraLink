'use client';

/**
 * P2-293 (run #185) — host payout receipt hook.
 *
 * Fetches GET /wallet/payout-receipt/:matchId for the completing host.
 * The hook is `enabled` only when the caller is the player-host of a
 * completed match (the component gates on the same flags); a 404 (not the
 * host / payout not released) resolves to `null` so the card simply never
 * renders — a missing receipt is not an error state for this surface.
 */
import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

export interface PayoutReceipt {
  matchId: string;
  matchTitle: string;
  completedAt: string | null;
  currency: 'SAR';
  payoutSar: number;
  forfeitSar: number;
  forfeits: number;
  totalCreditedSar: number;
  breakdown: {
    feePoolSar: number;
    payers: number;
    platformFeeSar: number;
    perJoinerFeeSar: number;
  };
}

export function usePayoutReceipt(matchId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['wallet', 'payout-receipt', matchId],
    queryFn: async (): Promise<PayoutReceipt | null> => {
      try {
        return await fetcher<PayoutReceipt>(
          `/wallet/payout-receipt/${matchId}`,
        );
      } catch (err) {
        if (err instanceof FetchError && err.status === 404) return null;
        throw err;
      }
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
