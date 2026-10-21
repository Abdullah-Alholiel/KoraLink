'use client';

/**
 * Tap-time slot revalidation (P2-234, run #152).
 *
 * The 0s-latest availability check for slot pickers. A picker's rendered
 * list is a snapshot — even with refetchOnMount:'always' it can go stale
 * while the sheet is open (another player books the same slot seconds
 * before our user taps). This hook re-reads the slots at TAP time and
 * refuses the pick when the tapped slot is no longer free, so the user
 * learns "just booked" at the tap — not as a generic failure at confirm.
 *
 * Contract (both picker surfaces):
 *  - Tap selects optimistically (no spinners in the picker grid).
 *  - A background network refetch re-reads availability; a stale snapshot
 *    is corrected within ~a round-trip even when the user never taps.
 *  - If the tapped slot is gone/booked in the fresh data, the caller's
 *    clear callback fires (onSelectSlot(null) — which resets date/time in
 *    HostMatchForm and unmarks the row in RescheduleSheet) and `taken`
 *    flips true so the surface renders host.errorSlotTaken (§12: localized,
 *    in-surface, role="alert", retry stays available).
 *  - Every tap re-checks from a clean slate: the taken flag clears at the
 *    start of each tap, so re-tapping a slot that has since become free
 *    recovers (the pick stands and the flag stays down). Without a fresh
 *    read the refusal never fires — the optimistic pick stands and the
 *    confirm call remains the authoritative gate.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PitchSlotApi } from '@/hooks/usePitchSlots';

/**
 * Query-key[0] of every pitch-slot query — the literal (NOT the
 * PITCH_SLOTS_BASE_KEY import: a value import from usePitchSlots would be
 * unresolvable inside vi.mock factories that stub @tanstack/react-query,
 * and any future key rename must stay in lockstep across all three files).
 */
const PITCH_SLOTS_KEY_0 = 'pitch-slots';

export function useSlotTapRevalidate(
    pitchId: string | null,
    date: string | null,
    opts: {
        /** The optimistic selection — called on every accepted tap. */
        onSelect: (slot: PitchSlotApi) => void;
        /** Called when the tap is refused (slot no longer free). */
        onTaken: () => void;
        /** True while a parent mutation is in flight — taps are ignored. */
        isCommitting?: boolean;
    },
) {
    const queryClient = useQueryClient();
    const [taken, setTaken] = useState(false);

    /** True when the slot the user tapped is no longer bookable. */
    const checkSlot = useCallback(
        (slot: PitchSlotApi, fresh: PitchSlotApi[]): boolean => {
            const current = fresh.find((s) => s.id === slot.id);
            return !current || current.is_booked;
        },
        [],
    );

    const handleSelect = useCallback(
        (slot: PitchSlotApi) => {
            if (!pitchId || !date || opts.isCommitting) return;

            // Every tap re-checks from a clean slate — a slot taken a
            // moment ago may be free again, so the stale flag must not
            // survive into a new decision.
            if (taken) setTaken(false);

            // 0s-latest read: fire the network call first, then reconcile
            // against its result.
            const key: [string, string | null, string | null] = [
                PITCH_SLOTS_KEY_0,
                pitchId,
                date,
            ];
            // dataUpdateCount only advances on a SUCCESSFUL data set — a
            // failed refetch keeps the previous data AND the old count, so
            // the count is what separates "fresh read landed" from "stale
            // cache survived the attempt".
            const countBefore =
                queryClient.getQueryState<PitchSlotApi[]>(key)?.dataUpdateCount ??
                0;
            void queryClient
                .refetchQueries({ queryKey: key })
                .then(() => {
                    const state =
                        queryClient.getQueryState<PitchSlotApi[]>(key);
                    if (!state || state.dataUpdateCount === countBefore) {
                        // No fresh read landed (refetch failed, offline, or
                        // nothing to refetch): cannot accuse the slot — the
                        // optimistic pick stands and the confirm call stays
                        // the gate.
                        return;
                    }
                    if (checkSlot(slot, state.data ?? [])) {
                        setTaken(true);
                        opts.onTaken();
                    }
                })
                .catch(() => {
                    // Refetch rejected (fetcher throws on non-2xx/network).
                    // Without a fresh read we cannot accuse the slot — the
                    // optimistic pick stands and the confirm call remains
                    // the authoritative gate (host.errorSlotTaken there).
                });

            opts.onSelect(slot);
        },
        // opts is read inside but its identity changes every render — list
        // only the fields the callback actually closes over.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [queryClient, pitchId, date, taken, checkSlot, opts.isCommitting],
    );

    // Stable identity — SlotPicker's day-change effect keys on this; an
    // inline arrow would re-run the effect every render and wipe `taken`
    // before the alert can paint.
    const clearTaken = useCallback(() => setTaken(false), []);

    return { handleSelect, slotTaken: taken, clearTaken };
}
