'use client';

/**
 * Host-form slot picker (booking via us — koralink mode).
 *
 * Owner directive (2026-09-18): the picker is TODAY-FIRST and TIME-AWARE.
 * Opening the form on a pitch shows today's remaining bookable slots
 * immediately — no date pick required — and slots whose start has already
 * passed never render (at 19:00, a 16:00–17:00 slot is dead). Day switching
 * uses the shared horizontal strip (same as Play/club detail/Reschedule);
 * availability itself streams from club-managed pitch_slots
 * (admin/partner → GET /pitches/:id/slots), filtered server-side on the
 * Riyadh clock with a client-side belt-and-braces pass.
 */

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Clock, Shield } from 'lucide-react';
import { usePitchSlots, type PitchSlotApi } from '@/hooks/usePitchSlots';
import { useNow } from '@/hooks/useNow';
import { riyadhDateKey, riyadhTimeNow } from '@/lib/venue-hours';
import DatePicker from '@/components/matches/DatePicker';

export interface SlotPickerProps {
    pitchId: string | null;
    selectedSlot: PitchSlotApi | null;
    onSelectSlot: (slot: PitchSlotApi) => void;
}

export default function SlotPicker({ pitchId, selectedSlot, onSelectSlot }: SlotPickerProps) {
    const t = useTranslations();

    /** Explicitly picked Riyadh day key; null = "today" (the default view). */
    const [pickedDayKey, setPickedDayKey] = useState<string | null>(null);

    // Read per render so a long-lived form re-anchors at Riyadh midnight.
    // included in the memo deps below (same pattern as the shared strip).
    const todayKey = riyadhDateKey();
    const effectiveKey = pickedDayKey ?? todayKey;
    const effectiveDate = useMemo(
        () => new Date(`${effectiveKey}T00:00:00Z`),
        [effectiveKey],
    );

    const { data: slots, isLoading, isError, refetch } = usePitchSlots(
        pitchId,
        effectiveKey,
    );

    // §19b: the wall clock enters render paths ONLY through useNow() — null
    // during SSR + first client paint (both sides render the unfiltered list,
    // so hydration can never mismatch), real clock from the first effect.
    const nowMs = useNow();
    const nowTime = nowMs === null ? null : riyadhTimeNow(new Date(nowMs));
    const nowKey = nowMs === null ? null : riyadhDateKey(new Date(nowMs));

    // Belt-and-braces: the server already drops past slots for today; this
    // client-side pass covers a list rendered before a slot lapsed (long-open
    // form) so a dead slot can never be tapped.
    const visibleSlots = useMemo(() => {
        if (!slots) return [];
        if (nowTime === null || nowKey === null) return slots;
        return slots.filter(
            (s) =>
                s.slot_date > nowKey ||
                s.start_time.slice(0, 5) > nowTime,
        );
    }, [slots, nowTime, nowKey]);

    /* ── Collapsed: slot chosen → locked summary (US5) ── */
    if (selectedSlot) {
        return (
            <div className="mt-3 rounded-xl border border-brand-green bg-brand-green/5 p-3.5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                        <Shield className="w-5 h-5 text-brand-green flex-shrink-0 mt-0.5" strokeWidth={2} />
                        <div>
                            <p className="text-[10px] font-bold text-brand-green uppercase tracking-wider">
                                {t('host.slotSelected')}
                            </p>
                            <p className="text-sm font-bold text-brand-black mt-0.5" dir="ltr">
                                {selectedSlot.slot_date} · {selectedSlot.start_time.slice(0, 5)} – {selectedSlot.end_time.slice(0, 5)}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {t('host.slotLocked')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onSelectSlot(null as unknown as PitchSlotApi)}
                        className="text-xs text-brand-red font-medium active:scale-95 transition-transform"
                    >
                        {t('host.changeSlot')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-3 space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {t('host.selectSlot')}
            </p>

            {/* Shared day strip — TODAY selected by default; picking a day
                clears any chosen slot (existing contract). fireOnMount=false:
                the picker's own state IS the selection — no mount-fire loop. */}
            <DatePicker
                onDateSelect={(d) => {
                    const key = riyadhDateKey(d);
                    if (key === effectiveKey) return; // re-tap on the active day
                    setPickedDayKey(key);
                    onSelectSlot(null as unknown as PitchSlotApi);
                }}
                fireOnMount={false}
                selectedDate={effectiveDate}
            />

            {/* Time slots — fetched for the effective day the moment a pitch
                is selected (no date pick needed). */}
            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                </div>
            ) : isError ? (
                <div className="flex flex-col items-center py-4">
                    <div className="w-12 h-12 rounded-full bg-brand-red/10 flex items-center justify-center mb-2">
                        <AlertTriangle className="w-6 h-6 text-brand-red" strokeWidth={1.5} />
                    </div>
                    <p className="text-xs text-gray-400 text-center mb-3">
                        {t('host.slotsError')}
                    </p>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        className="bg-brand-green text-white px-5 py-2 rounded-full text-xs font-bold active:scale-95 transition-transform"
                    >
                        {t('host.slotsRetry')}
                    </button>
                </div>
            ) : visibleSlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                    {visibleSlots.map((slot) => {
                        const isBooked = slot.is_booked;
                        const startLabel = slot.start_time.slice(0, 5); // "18:00"
                        const endLabel = slot.end_time.slice(0, 5);

                        return (
                            <button
                                key={slot.id}
                                disabled={isBooked}
                                onClick={() => onSelectSlot(slot)}
                                className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-semibold transition-all
                                    ${isBooked
                                        ? 'bg-gray-100 border-gray-150 text-gray-400 cursor-not-allowed line-through'
                                        : 'bg-white border-gray-200 text-brand-black hover:border-brand-green active:scale-[0.98]'
                                    }`}
                            >
                                <Clock className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                                <span>{startLabel} – {endLabel}</span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <p className="text-xs text-gray-400 text-center py-4">
                    {t('host.noSlotsAvailable')}
                </p>
            )}
        </div>
    );
}
