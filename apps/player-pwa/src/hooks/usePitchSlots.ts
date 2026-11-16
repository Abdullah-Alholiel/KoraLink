'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

// ─── API Response Types ────────────────────────────────

export interface PitchSlotApi {
  id: string;
  pitch_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  booked_match_id: string | null;
}

// ─── Domain type (no adapter needed — raw shape is display-ready) ──

export type PitchSlot = PitchSlotApi;

/**
 * Query-key[0] prefix shared by every pitch-slot query. Use it for
 * prefix invalidation after any booking mutation
 * (e.g. `invalidateQueries({ queryKey: [PITCH_SLOTS_BASE_KEY] })`).
 */
export const PITCH_SLOTS_BASE_KEY = 'pitch-slots';

/**
 * The full query key for a pitch+day slots read — the SINGLE source of
 * the key shape. usePitchSlots queries through this and tap-time
 * revalidation (useSlotTapRevalidate) refetches through it, so the two
 * can never drift apart on a rename (PR-Agent r1, P2-234).
 */
export function pitchSlotsQueryKey(
  pitchId: string | null,
  date: string | null,
): [string, string | null, string | null] {
  return [PITCH_SLOTS_BASE_KEY, pitchId, date];
}

// ─── Fetch Slots for a Pitch on a Date ────────────────
//
// P2-234 (run #152): slot availability must never ride a stale cache at
// decision time — in a peak-hours padel market two players can tap the same
// slot seconds apart. The short staleTime alone let a list render from a
// 30s-old snapshot with no refetch, and the picker disabled nothing that
// had gone booked since. So:
//  - `refetchOnMount: 'always'` — every picker mount (sheet open, fresh
//    host form) force-refetches even when a fresh cache entry exists.
//    Instant paint from cache is preserved; the network read just rides it.
//  - `refetchOnReconnect: 'always'` — coming back online (the PWA is used
//    in network-spotty venues) forces one fresh read too.
// On top of this, SlotPicker / RescheduleSheet revalidate the TAPPED slot
// at tap time — the 0s-latest check before the user commits (see
// useSlotTapRevalidate).
export function usePitchSlots(pitchId: string | null, date: string | null) {
  return useQuery<PitchSlotApi[], FetchError>({
    queryKey: pitchSlotsQueryKey(pitchId, date),
    queryFn: () =>
      fetcher<PitchSlotApi[]>(`/pitches/${pitchId}/slots?date=${date}`),
    enabled: !!pitchId && !!date,
    staleTime: 30_000, // 30s — slots change quickly
    refetchOnMount: 'always', // P2-234 — never show a picker from stale cache
    refetchOnReconnect: 'always',
  });
}
