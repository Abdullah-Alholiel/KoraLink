'use client';

/**
 * RescheduleSheet (P1-13 run #20, cross-day run #21) — host moves a koralink
 * match to a different FREE slot on the SAME pitch, on ANY of the next 7 days.
 * Day strip reuses the Play feed's DatePicker idiom; slots come via
 * usePitchSlots (the same data the host flow books from), one tap to select,
 * confirm fires PATCH /matches/:id/schedule. Self-mode matches never open
 * this sheet (the host action is gated upstream).
 */

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, Check, Clock, X } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';
import DatePicker from '@/components/matches/DatePicker';
import {
    usePitchSlots,
    type PitchSlotApi,
} from '@/hooks/usePitchSlots';
import { dateInRiyadh, todayInRiyadh } from '@/lib/api-adapter';

interface RescheduleSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (slot: PitchSlotApi) => void;
    /** Current slot the match occupies (excluded from the picker). */
    currentSlotId?: string | null;
    pitchId: string;
    matchTitle: string;
    /** 5 UX states — parent passes its own pending flag (mutation). */
    isPending?: boolean;
}

export default function RescheduleSheet({
    isOpen,
    onClose,
    onConfirm,
    currentSlotId,
    pitchId,
    matchTitle,
    isPending,
}: RescheduleSheetProps) {
    const t = useTranslations();
    const locale = useLocale();
    // Default to today so the common "move it later today" case is unchanged;
    // the day strip reaches the next 6 days too (cross-day reschedule).
    const [slotDate, setSlotDate] = useState<string | null>(todayInRiyadh());
    const [selectedSlot, setSelectedSlot] = useState<PitchSlotApi | null>(null);

    const { data: slots, isLoading, isError, refetch } = usePitchSlots(
        isOpen ? pitchId : null,
        isOpen ? slotDate : null,
    );

    const freeSlots = useMemo(
        () => (slots ?? []).filter((s) => !s.is_booked && s.id !== currentSlotId),
        [slots, currentSlotId],
    );

    const dayLabel = useMemo(
        () =>
            slotDate
                ? new Date(`${slotDate}T00:00:00`).toLocaleDateString(
                    locale === 'ar' ? 'ar-SA' : 'en-US',
                    { weekday: 'long', day: 'numeric', month: 'long' },
                )
                : '',
        [slotDate, locale],
    );

    const fmtTime = (time: string) =>
        new Date(`2025-01-01T${time.slice(0, 5)}`).toLocaleTimeString(
            locale === 'ar' ? 'ar-SA' : 'en-US',
            { hour: 'numeric', minute: '2-digit' },
        );

    const handleDaySelect = (date: Date) => {
        setSlotDate(dateInRiyadh(date));
        setSelectedSlot(null); // a slot id belongs to a day — clear the pick
    };

    /* Reset the selection whenever the sheet closes so a stale pick can't
       survive a reopen. */
    const handleClose = () => {
        setSelectedSlot(null);
        setSlotDate(todayInRiyadh());
        onClose();
    };

    if (!isOpen) return null;

    return (
        <BottomSheet open={isOpen} onClose={handleClose} widthClass="max-w-xl">
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
                <div className="w-8" />
                <h2 className="text-lg font-bold text-brand-black">
                    {t('reschedule.title')}
                </h2>
                <button
                    onClick={handleClose}
                    aria-label={t('common.close')}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                    <X />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-container min-h-0 pb-4">
                <p className="text-xs text-gray-400 text-center mb-1 px-5 truncate">
                    {matchTitle}
                </p>

                {/* Day strip — 7 days, TODAY chip included (DatePicker's own
                    i18n); controlled so the active day survives re-renders. */}
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 mb-0.5">
                    {t('reschedule.pickDay')}
                </p>
                <div className="-mx-1">
                    <DatePicker
                        selectedDate={
                            slotDate ? new Date(`${slotDate}T00:00:00`) : null
                        }
                        onDateSelect={handleDaySelect}
                        fireOnMount={false}
                    />
                </div>

                {/* Loading state */}
                {isLoading && (
                    <div className="space-y-2 px-5" aria-busy="true">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="h-14 rounded-xl bg-gray-100 animate-pulse"
                            />
                        ))}
                    </div>
                )}

                {/* Error state */}
                {isError && (
                    <div className="rounded-xl border border-brand-red/30 bg-brand-red/5 p-4 text-center mx-5">
                        <p className="text-sm text-brand-red font-semibold mb-2">
                            {t('common.error')}
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="text-xs font-bold text-brand-green underline"
                        >
                            {t('common.retry')}
                        </button>
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && !isError && freeSlots.length === 0 && (
                    <div className="rounded-xl bg-gray-50 p-6 text-center mx-5">
                        <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" strokeWidth={1.5} />
                        <p className="text-sm text-gray-500">{t('reschedule.noSlots')}</p>
                    </div>
                )}

                {/* Success state — free-slot list for the selected day */}
                {!isLoading && !isError && freeSlots.length > 0 && (
                    <div className="px-5">
                        <div className="flex items-center gap-2 mb-2 px-1">
                            <Clock className="w-3.5 h-3.5 text-brand-green" strokeWidth={2} />
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider" dir="auto">
                                {dayLabel}
                            </p>
                        </div>
                        <div className="space-y-2">
                            {freeSlots.map((slot) => {
                                const isSel = selectedSlot?.id === slot.id;
                                return (
                                    <button
                                        key={slot.id}
                                        onClick={() => setSelectedSlot(slot)}
                                        aria-pressed={isSel}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                                            isSel
                                                ? 'border-brand-green bg-brand-green/10 text-brand-green'
                                                : 'border-gray-200 text-brand-black hover:border-brand-green/40'
                                        }`}
                                    >
                                        <span dir="ltr">{fmtTime(slot.start_time)}</span>
                                        {isSel && <Check className="w-4 h-4" strokeWidth={2.5} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="px-5 pb-8 pt-3 flex-shrink-0">
                <button
                    onClick={() => selectedSlot && onConfirm(selectedSlot)}
                    disabled={!selectedSlot || isPending}
                    className="w-full py-4 rounded-2xl bg-brand-green text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                    {isPending ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : null}
                    {t('reschedule.confirm')}
                </button>
            </div>
        </BottomSheet>
    );
}
