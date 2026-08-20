'use client';

import { type ReactNode, type ChangeEvent, type MouseEvent } from 'react';

/**
 * Cross-platform native date/time picker field (phone PWA ↔ desktop parity).
 *
 * Pattern (each rule from a real KoraLink regression):
 * 1. The native `<input type="date|time">` IS the hit target — a full-size
 *    invisible overlay (`absolute inset-0 opacity-0`) inside a styled
 *    `<label>`. NEVER `sr-only` (untappable everywhere) and NEVER nested in
 *    a `<button>` (invalid HTML; iOS never delivers the tap — f22886c).
 * 2. iOS WebKit opens the wheel picker on bare tap — `showPicker()` is
 *    undefined there, so the guarded call below is a no-op.
 * 3. Desktop Chromium only FOCUSES the input on click; the calendar/clock
 *    popup never opens without `showPicker()` — the guarded call opens it.
 *    try/catch because it throws without user activation or in background
 *    documents (expected, not an error).
 */
export interface DateTimeOverlayInputProps {
    type: 'date' | 'time';
    value: string;
    onChange: (value: string) => void;
    /** Visible uppercase caption (also the input's aria-label). */
    label: string;
    /** Styled display row rendered inside the card (icon + formatted value). */
    display: ReactNode;
    /** `min` attribute — date inputs only. */
    min?: string;
    /** `step` attribute in seconds — time inputs only (600 = 10 min). */
    step?: number;
    /** Extra classes for the outer card (e.g. `flex-1`). */
    className?: string;
}

export default function DateTimeOverlayInput({
    type,
    value,
    onChange,
    label,
    display,
    min,
    step,
    className = '',
}: DateTimeOverlayInputProps) {
    const handleClick = (e: MouseEvent<HTMLInputElement>) => {
        const el = e.currentTarget;
        if (typeof el.showPicker === 'function') {
            try {
                el.showPicker();
            } catch {
                // Expected without user activation — the native tap/keyboard
                // path still works; nothing to recover from.
            }
        }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);

    return (
        <label
            className={`relative bg-gray-50 rounded-xl border border-gray-100 p-3.5 text-start cursor-pointer ${className}`}
        >
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                {label}
            </p>
            {display}
            <input
                type={type}
                value={value}
                min={type === 'date' ? min : undefined}
                step={type === 'time' ? step : undefined}
                onChange={handleChange}
                onClick={handleClick}
                aria-label={label}
                className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
            />
        </label>
    );
}
