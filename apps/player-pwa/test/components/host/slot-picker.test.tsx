import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import { riyadhDateKey } from '@/lib/venue-hours';

/**
 * Host-form slot picker — today-first + time-aware (owner directive
 * 2026-09-18):
 *  1. slots for TODAY render the moment a pitch is selected — no date pick;
 *  2. past slots (start <= Riyadh now) are never rendered — the shared day
 *     strip replaces the old pick-a-date-first input;
 *  3. day switching goes through the SHARED DatePicker (standard dynamic
 *     form) and clears a chosen slot;
 *  4. the 5-UX-states contract: loading skeletons, error + retry, empty.
 *
 * §19 clock-robust fixtures: every expected key/label derives from the SAME
 * riyadhDateKey() anchor the component uses — the suite is correct from any
 * runner timezone at any hour.
 */

const { usePitchSlotsMock } = vi.hoisted(() => ({
    usePitchSlotsMock: vi.fn(),
}));

vi.mock('@/hooks/usePitchSlots', () => ({
    usePitchSlots: usePitchSlotsMock,
}));

// Deterministic "now": the REAL Riyadh day at 16:00Z == 19:00 Riyadh (the
// exact hour from Abdullah's report — 16:00–17:00 and 17:00–18:00 are past).
const TODAY_KEY = riyadhDateKey();
const FIXED_NOW = new Date(`${TODAY_KEY}T16:00:00Z`).getTime();

vi.mock('@/hooks/useNow', () => ({
    useNow: () => FIXED_NOW,
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/en/host',
}));

import SlotPicker from '@/components/host/SlotPicker';
import type { PitchSlotApi } from '@/hooks/usePitchSlots';

/** Day-key N days after the strip's TODAY anchor (same 24h math as the strip). */
function dayKeyAfter(offsetDays: number): string {
    const base = new Date(`${TODAY_KEY}T00:00:00Z`);
    return riyadhDateKey(new Date(base.getTime() + offsetDays * 86_400_000));
}

/** The chip's accessible name — the EXACT formatting call DatePicker makes. */
function chipLabel(offsetDays: number): string {
    const base = new Date(`${TODAY_KEY}T00:00:00Z`);
    const d = new Date(base.getTime() + offsetDays * 86_400_000);
    return d.toLocaleDateString('en', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    });
}

function renderPicker(props: Partial<React.ComponentProps<typeof SlotPicker>> = {}) {
    const onSelectSlot = props.onSelectSlot ?? vi.fn();
    const utils = render(
        <NextIntlClientProvider messages={enMessages} locale="en">
            <SlotPicker
                pitchId="pitch-1"
                selectedSlot={null}
                onSelectSlot={onSelectSlot}
                {...props}
            />
        </NextIntlClientProvider>,
    );
    return { onSelectSlot, container: utils.container };
}

function slotOn(
    dayKey: string,
    id: string,
    start: string,
    end: string,
    isBooked = false,
): PitchSlotApi {
    return {
        id,
        pitch_id: 'pitch-1',
        slot_date: dayKey,
        start_time: start,
        end_time: end,
        is_booked: isBooked,
        booked_match_id: null,
    };
}

describe('SlotPicker — today-first, time-aware slots', () => {
    beforeEach(() => {
        usePitchSlotsMock.mockReset();
        usePitchSlotsMock.mockReturnValue({
            data: [], isLoading: false, isError: false, refetch: vi.fn(),
        });
    });

    it('queries slots for TODAY on mount — no date pick required', () => {
        renderPicker();

        expect(usePitchSlotsMock).toHaveBeenCalledWith('pitch-1', TODAY_KEY);
        // the old "pick a date first" gate is gone
        expect(screen.queryByText(/pick a date/i)).not.toBeInTheDocument();
    });

    it('hides slots whose start has passed (19:00 Riyadh) and shows upcoming ones', () => {
        usePitchSlotsMock.mockReturnValue({
            data: [
                slotOn(TODAY_KEY, 's1', '16:00:00', '17:00:00'), // past → hidden
                slotOn(TODAY_KEY, 's2', '17:00:00', '18:00:00'), // past → hidden
                slotOn(TODAY_KEY, 's3', '19:00:00', '20:00:00'), // start == now → hidden (mirror of the server guard)
                slotOn(TODAY_KEY, 's4', '21:00:00', '22:00:00'), // later → visible
                slotOn(TODAY_KEY, 's5', '18:00:00', '19:00:00', true), // past + booked → hidden
            ],
            isLoading: false, isError: false, refetch: vi.fn(),
        });

        renderPicker();

        expect(screen.queryByText('16:00 – 17:00')).not.toBeInTheDocument();
        expect(screen.queryByText('17:00 – 18:00')).not.toBeInTheDocument();
        expect(screen.queryByText('18:00 – 19:00')).not.toBeInTheDocument();
        expect(screen.queryByText('19:00 – 20:00')).not.toBeInTheDocument();
        expect(screen.getByText('21:00 – 22:00')).toBeInTheDocument();
    });

    it('renders the shared day strip with today selected', () => {
        renderPicker();

        const todayChip = screen.getByLabelText(chipLabel(0));
        expect(todayChip.getAttribute('aria-current')).toBe('date');
        expect(todayChip.getAttribute('aria-pressed')).toBe('true');
    });

    it('switching day fetches that day and clears a chosen slot', () => {
        const { onSelectSlot } = renderPicker();

        fireEvent.click(screen.getByLabelText(chipLabel(1)));

        expect(usePitchSlotsMock).toHaveBeenLastCalledWith('pitch-1', dayKeyAfter(1));
        expect(onSelectSlot).toHaveBeenCalledWith(null);
    });

    it('shows loading skeletons while fetching', () => {
        usePitchSlotsMock.mockReturnValue({
            data: undefined, isLoading: true, isError: false, refetch: vi.fn(),
        });

        const { container } = renderPicker();
        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('shows the error state with a working retry', () => {
        const refetch = vi.fn();
        usePitchSlotsMock.mockReturnValue({
            data: undefined, isLoading: false, isError: true, refetch,
        });

        renderPicker();

        expect(screen.getByText(/couldn't load available slots/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('shows the empty state when nothing remains for the day', () => {
        renderPicker();
        expect(screen.getByText(/no slots available for this date/i)).toBeInTheDocument();
    });

    it('tapping a visible slot selects it', () => {
        usePitchSlotsMock.mockReturnValue({
            data: [slotOn(TODAY_KEY, 's4', '21:00:00', '22:00:00')],
            isLoading: false, isError: false, refetch: vi.fn(),
        });

        const { onSelectSlot } = renderPicker();
        // aria-label supplies the accessible name (visible text is 21:00 – 22:00)
        fireEvent.click(screen.getByRole('button', { name: /Book slot from 21:00 to 22:00/ }));

        expect(onSelectSlot).toHaveBeenCalledWith(
            expect.objectContaining({ id: 's4' }),
        );
    });

    it('keeps a booked upcoming slot visible but disabled', () => {
        usePitchSlotsMock.mockReturnValue({
            data: [slotOn(TODAY_KEY, 's6', '21:00:00', '22:00:00', true)],
            isLoading: false, isError: false, refetch: vi.fn(),
        });

        renderPicker();

        // booked slots announce their state in the accessible name (P2 review, run #61)
        expect(screen.getByRole('button', { name: /already booked/ })).toBeDisabled();
    });

    it('collapses to the locked summary once a slot is chosen', () => {
        renderPicker({ selectedSlot: slotOn(TODAY_KEY, 's3', '19:00:00', '20:00:00') });

        expect(screen.getByText('Selected slot')).toBeInTheDocument();
        expect(
            screen.getByText(`${TODAY_KEY} · 19:00 – 20:00`, { selector: '[dir="ltr"]' }),
        ).toBeInTheDocument();
        expect(screen.queryByLabelText(chipLabel(0))).not.toBeInTheDocument();
    });

    // ── run #61 review refinements (Reviewer B design lens) ──

    it('announces slot-fetch errors to assistive tech via role=status', () => {
        usePitchSlotsMock.mockReturnValue({
            data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
        });

        const { container } = renderPicker();

        expect(container.querySelector('[role="status"]')).not.toBeNull();
    });

    // ── run #66 P2-79 residual: loading + empty states announce too ──

    it('announces the loading skeleton via role=status + aria-busy (P2-79 residual)', () => {
        usePitchSlotsMock.mockReturnValue({
            data: undefined, isLoading: true, isError: false, refetch: vi.fn(),
        });

        const { container } = renderPicker();

        const live = container.querySelector('[role="status"][aria-busy="true"]');
        expect(live).not.toBeNull();
        expect(live?.getAttribute('aria-live')).toBe('polite');
        expect(live?.getAttribute('aria-label')).toBe('Loading available slots…');
        expect(live?.querySelectorAll('.animate-pulse').length).toBe(3);
    });

    it('announces the empty state via role=status (P2-79 residual)', () => {
        usePitchSlotsMock.mockReturnValue({
            data: [], isLoading: false, isError: false, refetch: vi.fn(),
        });

        const { container } = renderPicker();

        const statuses = Array.from(container.querySelectorAll('[role="status"]'));
        expect(statuses.length).toBe(1);
        expect(statuses[0].textContent).toMatch(/no slots available for this date/i);
    });
});
