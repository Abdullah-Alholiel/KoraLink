'use client';

/**
 * Shared horizontal calendar-day strip (modular, run #21b).
 *
 * One component, three consumers: Play feed, club detail, RescheduleSheet —
 * all inherit the same window + affordances:
 *  - `days` window (default 30 — product cap, Abdullah 2026-08-31); the strip
 *    scrolls horizontally (RTL-aware: scrolls from the start side in Arabic).
 *  - TODAY marker: the first card keeps the "TODAY" label AND carries a dot
 *    (aria-hidden) — every card reserves the dot row so heights stay equal.
 *  - a11y: chips expose `aria-pressed` (selection), the today card sets
 *    `aria-current="date"`, and every chip has a full localized date label.
 *
 * Controlled usage: pass `selectedDate` (Date | null — null = no selection).
 * `fireOnMount` keeps the Play page's initial filter behavior.
 */

import { useState, useMemo, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';

interface DatePickerProps {
    onDateSelect?: (date: Date) => void;
    /** Fire onDateSelect on mount with today's date. Default true (needed by Play page). */
    fireOnMount?: boolean;
    /**
     * Controlled selected date. When provided, the matching day is highlighted
     * (instead of the internal selection), so reopening a sheet shows the user's
     * previously chosen date instead of resetting to TODAY. Pass `null` to
     * explicitly show no selection (Play "all games" default).
     */
    selectedDate?: Date | null;
    /** Calendar window length in days. Default 30 (product cap). */
    days?: number;
}

const DEFAULT_DAYS = 30;

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

export default function DatePicker({
    onDateSelect,
    fireOnMount = true,
    selectedDate,
    days = DEFAULT_DAYS,
}: DatePickerProps) {
    const t = useTranslations('datePicker');
    const locale = useLocale();
    const [selectedIndex, setSelectedIndex] = useState(0);

    const dates = useMemo(() => {
        const today = new Date();
        return Array.from({ length: Math.max(1, days) }, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const isToday = i === 0;
            // Localized day abbreviation (e.g. "Mon", "الاثنين")
            const dayAbbr = d.toLocaleDateString(locale, { weekday: 'short' });
            return {
                date: d,
                dayLabel: isToday ? t('today') : dayAbbr,
                dayNumber: d.getDate(),
                isToday,
                // Full localized date for the chip's accessible name.
                ariaLabel: d.toLocaleDateString(locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                }),
            };
        });
    }, [locale, t, days]);

    // Fire initial onDateSelect on mount so the parent filters by today.
    useEffect(() => {
        if (fireOnMount) onDateSelect?.(dates[0].date);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When controlled, reflect the parent's selectedDate; otherwise fall back to
    // the internal index (Play page keeps its own string state). `null` means
    // explicitly "no selection" — used by the Play page's all-games default.
    const activeIndex = useMemo(() => {
        if (selectedDate === null) return -1;
        if (!selectedDate) return selectedIndex;
        const idx = dates.findIndex((item) => isSameDay(item.date, selectedDate));
        return idx >= 0 ? idx : selectedIndex;
    }, [selectedDate, selectedIndex, dates]);

    return (
        <div className="flex gap-1 px-4 py-3 scroll-container overflow-x-auto">
            {dates.map((item, idx) => {
                const isActive = idx === activeIndex;
                return (
                    <button
                        key={idx}
                        onClick={() => {
                            setSelectedIndex(idx);
                            onDateSelect?.(item.date);
                        }}
                        aria-pressed={isActive}
                        aria-current={item.isToday ? 'date' : undefined}
                        aria-label={item.ariaLabel}
                        className={`
              flex flex-col items-center px-3 py-2 rounded-lg min-w-[52px] flex-shrink-0 transition-all
              ${isActive
                                ? 'bg-brand-black'
                                : 'bg-transparent hover:bg-gray-50'
                            }
            `}
                    >
                        <span
                            className={`text-[10px] font-semibold tracking-wider ${isActive ? 'text-white' : 'text-gray-400'
                                }`}
                        >
                            {item.dayLabel}
                        </span>
                        <span
                            className={`text-base font-bold mt-0.5 ${isActive ? 'text-white' : 'text-brand-black'
                                }`}
                        >
                            {item.dayNumber}
                        </span>
                        {/* TODAY dot — the row is reserved on every card so all
                            chips render the same height; transparent elsewhere. */}
                        <span
                            aria-hidden="true"
                            data-testid={item.isToday ? 'today-dot' : undefined}
                            className={`mt-0.5 h-1 w-1 rounded-full ${
                                item.isToday
                                    ? isActive
                                        ? 'bg-white'
                                        : 'bg-brand-green'
                                    : 'bg-transparent'
                            }`}
                        />
                    </button>
                );
            })}
        </div>
    );
}
