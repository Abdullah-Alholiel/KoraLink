'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, Clock, Shield } from 'lucide-react';
import { usePitchSlots, type PitchSlotApi } from '@/hooks/usePitchSlots';
import { todayInRiyadh } from '@/lib/api-adapter';
import DateTimeOverlayInput from '@/components/host/DateTimeOverlayInput';

export interface SlotPickerProps {
    pitchId: string | null;
    /** Seed the slot calendar with this date (e.g. club → "Host Here"). */
    initialDate?: string | null;
    selectedSlot: PitchSlotApi | null;
    onSelectSlot: (slot: PitchSlotApi) => void;
}

export default function SlotPicker({ pitchId, initialDate, selectedSlot, onSelectSlot }: SlotPickerProps) {
    const locale = useLocale();
    const t = useTranslations();
    const [slotDate, setSlotDate] = useState(initialDate ?? '');

    const { data: slots, isLoading } = usePitchSlots(
        pitchId,
        slotDate || null,
    );

    // Get today's date in Riyadh as the min for the date picker (the app's
    // canonical timezone — avoids an off-by-one near midnight).
    const today = todayInRiyadh();

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

            {/* Date picker — shared cross-platform overlay (iOS tap opens the
                wheel natively; desktop opens the calendar via guarded
                showPicker()) */}
            <DateTimeOverlayInput
                type="date"
                value={slotDate}
                onChange={(v) => {
                    setSlotDate(v);
                    onSelectSlot(null as unknown as PitchSlotApi); // clear selection
                }}
                label={t('host.slotDate')}
                min={today}
                display={
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                        <span className="text-sm font-bold text-brand-black">
                            {slotDate
                                ? new Date(slotDate + 'T00:00:00').toLocaleDateString(
                                    locale === 'ar' ? 'ar-SA' : 'en-US',
                                    { month: 'short', day: 'numeric', weekday: 'short' },
                                )
                                : t('host.pickDateFirst')}
                        </span>
                    </div>
                }
            />

            {/* Time slots */}
            {slotDate && (
                <>
                    {isLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                            ))}
                        </div>
                    ) : slots && slots.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                            {slots.map((slot) => {
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
                </>
            )}
        </div>
    );
}
