'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import { trackEvent, captureError } from '@/providers/ObservabilityProvider';

// ─── Disputes (no-show appeal + player-originated tickets, P1-69) ─────────

/** The five dispute categories (DisputeType enum, schema.ts:142). */
export type DisputeType = 'no_show' | 'double_booking' | 'pitch_condition' | 'unrecognized_charge' | 'other';

export interface MyDispute {
    id: string;
    type: string;
    status: 'opened' | 'under_review' | 'resolved' | 'rejected';
    decision: string | null;
    /** True once the player attached their appeal to the auto-opened dispute. */
    has_appealed: boolean;
    created_at: string;
    updated_at: string;
}

/** Current user's dispute on a match (null when none exists). */
export function useMyDispute(matchId: string, enabled = true) {
    return useQuery<MyDispute | null, FetchError>({
        queryKey: ['dispute', matchId],
        queryFn: () => fetcher<MyDispute | null>(`/matches/${matchId}/my-dispute`),
        enabled: !!matchId && enabled,
        staleTime: 30_000,
    });
}

/** Open a no-show appeal (POST /matches/:id/dispute). */
export function useAppeal(matchId: string) {
    const queryClient = useQueryClient();

    return useMutation<MyDispute, FetchError, { reason?: string }>({
        mutationFn: async ({ reason }) =>
            fetcher<MyDispute>(`/matches/${matchId}/dispute`, {
                method: 'POST',
                body: JSON.stringify({ type: 'no_show', ...(reason ? { reason } : {}) }),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dispute', matchId] });
            trackEvent('no_show_appeal_submitted', { match_id: matchId });
        },
        onError: (err) => captureError(err, { scope: 'appeal' }),
    });
}

/**
 * Open a dispute in ANY category (P1-69 player origination) — same endpoint
 * as useAppeal; the sheet supplies the category. The API only requires an
 * actual no-show mark for type=no_show; the other four categories are open
 * to any roster member.
 */
export function useOpenDispute(matchId: string) {
    const queryClient = useQueryClient();

    return useMutation<MyDispute, FetchError, { type: DisputeType; reason?: string }>({
        mutationFn: async ({ type, reason }) =>
            fetcher<MyDispute>(`/matches/${matchId}/dispute`, {
                method: 'POST',
                body: JSON.stringify({ type, ...(reason ? { reason } : {}) }),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dispute', matchId] });
            trackEvent('dispute_opened', { match_id: matchId });
        },
        onError: (err) => captureError(err, { scope: 'dispute' }),
    });
}

// ─── Public platform settings ─────────────────────────

export interface PublicSettings {
    refund_policy: string;
}

/** Public, non-sensitive platform policy (refund policy etc.). */
export function usePublicSettings() {
    return useQuery<PublicSettings, FetchError>({
        queryKey: ['settings', 'public'],
        queryFn: () => fetcher<PublicSettings>('/settings/public'),
        staleTime: 10 * 60_000,
    });
}
