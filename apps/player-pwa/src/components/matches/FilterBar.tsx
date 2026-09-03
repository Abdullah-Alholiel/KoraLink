'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal, X } from 'lucide-react';
import BottomSheet from '@/components/layout/BottomSheet';

export interface PlayFilters {
    format: string | null;
    gender: string | null;
    maxPrice: number | null;
    time: string | null;
}

interface FilterBarProps {
    filters: PlayFilters;
    onChange: (filters: PlayFilters) => void;
}

const FORMAT_KEYS = ['5v5', '7v7', '8v8', '11v11'] as const;
// Value (API gender) → display key. API uses 'men'/'women'/'mixed', NOT 'Men Only'.
const GENDER_KEYS = [
    { value: 'men', labelKey: 'matchDetail.gender.men' },
    { value: 'women', labelKey: 'matchDetail.gender.women' },
    { value: 'mixed', labelKey: 'matchDetail.gender.mixed' },
] as const;
// API time-of-day presets (GetMatchesDto TIME_WINDOW_KEYS) → i18n keys.
const TIME_KEYS = [
    { value: 'morning', labelKey: 'play.filters.time.morning' },
    { value: 'afternoon', labelKey: 'play.filters.time.afternoon' },
    { value: 'evening', labelKey: 'play.filters.time.evening' },
    { value: 'night', labelKey: 'play.filters.time.night' },
] as const;
const PRICE_OPTIONS = [25, 50, 100];

export default function FilterBar({ filters, onChange }: FilterBarProps) {
    const t = useTranslations();
    const [showSheet, setShowSheet] = useState(false);

    const activeCount =
        (filters.format ? 1 : 0) +
        (filters.gender ? 1 : 0) +
        (filters.maxPrice != null ? 1 : 0) +
        (filters.time ? 1 : 0);

    // Quick format toggle chips (inline)
    const toggleFormat = (f: string) => {
        onChange({
            ...filters,
            format: filters.format === f ? null : f,
        });
    };

    return (
        <>
            {/* ── Inline quick format chips + filter button ── */}
            <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scroll-container">
                {FORMAT_KEYS.map((f) => (
                    <button
                        key={f}
                        onClick={() => toggleFormat(f)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                            filters.format === f
                                ? 'bg-brand-green text-white'
                                : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                    >
                        {f}
                    </button>
                ))}

                {/* Filter button */}
                <button
                    onClick={() => setShowSheet(true)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ms-auto flex-shrink-0 ${
                        activeCount > 0
                            ? 'bg-brand-black text-white'
                            : 'bg-white text-gray-500 border border-gray-200'
                    }`}
                >
                    <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2} />
                    {activeCount > 0 ? activeCount : ''}
                </button>
            </div>

            {/* ── Filter bottom sheet ── */}
            <BottomSheet open={showSheet} onClose={() => setShowSheet(false)} maxHeightClass="max-h-[85dvh]">
                {/* Pull handle */}
                <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-50 flex-shrink-0">
                    <h2 className="text-base font-bold text-brand-black">
                        {t('play.filters.title')}
                    </h2>
                    <button
                        onClick={() => setShowSheet(false)}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <X className="w-4 h-4 text-gray-500" strokeWidth={2} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto scroll-container min-h-0 px-5 py-4">
                    {/* Gender */}
                    <div className="mb-6">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                            {t('play.filters.gender')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {GENDER_KEYS.map((g) => (
                                <button
                                    key={g.value}
                                    onClick={() =>
                                        onChange({
                                            ...filters,
                                            gender: filters.gender === g.value ? null : g.value,
                                        })
                                    }
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                                        filters.gender === g.value
                                            ? 'bg-brand-green text-white'
                                            : 'bg-gray-50 text-gray-600 border border-gray-200'
                                    }`}
                                >
                                    {t(g.labelKey)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Time of day */}
                    <div className="mb-6">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                            {t('play.filters.time.title')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {TIME_KEYS.map((tk) => (
                                <button
                                    key={tk.value}
                                    onClick={() =>
                                        onChange({
                                            ...filters,
                                            time: filters.time === tk.value ? null : tk.value,
                                        })
                                    }
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                                        filters.time === tk.value
                                            ? 'bg-brand-green text-white'
                                            : 'bg-gray-50 text-gray-600 border border-gray-200'
                                    }`}
                                >
                                    {t(tk.labelKey)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Max Price */}
                    <div className="mb-6">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                            {t('play.filters.price')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {PRICE_OPTIONS.map((p) => (
                                <button
                                    key={p}
                                    onClick={() =>
                                        onChange({
                                            ...filters,
                                            maxPrice: filters.maxPrice === p ? null : p,
                                        })
                                    }
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                                        filters.maxPrice === p
                                            ? 'bg-brand-green text-white'
                                            : 'bg-gray-50 text-gray-600 border border-gray-200'
                                    }`}
                                >
                                    ≤ {p} SAR
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Reset */}
                    {activeCount > 0 && (
                        <button
                            onClick={() => {
                                onChange({ format: null, gender: null, maxPrice: null, time: null });
                            }}
                            className="w-full py-3 rounded-xl text-sm font-semibold text-brand-red border border-brand-red/20 active:scale-[0.98] transition-transform"
                        >
                            {t('play.filters.reset')}
                        </button>
                    )}
                </div>
            </BottomSheet>
        </>
    );
}
