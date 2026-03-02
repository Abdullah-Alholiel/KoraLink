'use client';

import { useState, useMemo } from 'react';

interface DatePickerProps {
    onDateSelect?: (date: Date) => void;
}

export default function DatePicker({ onDateSelect }: DatePickerProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const dates = useMemo(() => {
        const today = new Date();
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            return {
                date: d,
                dayLabel: i === 0 ? 'TODAY' : dayNames[d.getDay()],
                dayNumber: d.getDate(),
            };
        });
    }, []);

    return (
        <div className="flex gap-1 px-4 py-3 scroll-container overflow-x-auto">
            {dates.map((item, idx) => {
                const isActive = idx === selectedIndex;
                return (
                    <button
                        key={idx}
                        onClick={() => {
                            setSelectedIndex(idx);
                            onDateSelect?.(item.date);
                        }}
                        className={`
              flex flex-col items-center px-3 py-2 rounded-lg min-w-[52px] transition-all
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
                    </button>
                );
            })}
        </div>
    );
}
