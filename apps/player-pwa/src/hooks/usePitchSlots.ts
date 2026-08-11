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

// ─── Fetch Slots for a Pitch on a Date ────────────────

export function usePitchSlots(pitchId: string | null, date: string | null) {
  return useQuery<PitchSlotApi[], FetchError>({
    queryKey: ['pitch-slots', pitchId, date],
    queryFn: () =>
      fetcher<PitchSlotApi[]>(`/pitches/${pitchId}/slots?date=${date}`),
    enabled: !!pitchId && !!date,
    staleTime: 30_000, // 30s — slots change quickly
  });
}
