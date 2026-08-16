import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import MatchDetailsForm, { snapTimeTo10 } from '@/components/host/MatchDetailsForm';
import { todayInRiyadh } from '@/lib/api-adapter';

function renderForm(overrides: Partial<Parameters<typeof MatchDetailsForm>[0]> = {}) {
  const props = {
    title: '',
    setTitle: () => {},
    matchType: 'Casual' as const,
    setMatchType: () => {},
    genderRule: 'Men Only' as const,
    setGenderRule: () => {},
    date: '',
    setDate: () => {},
    time: '',
    setTime: () => {},
    duration: 60,
    setDuration: () => {},
    ...overrides,
  };
  return render(
    <NextIntlClientProvider messages={enMessages} locale="en">
      <MatchDetailsForm {...props} />
    </NextIntlClientProvider>,
  );
}

describe('MatchDetailsForm — iOS-safe date/time inputs', () => {
  it('renders the date input as a real tappable overlay (not sr-only, no showPicker button)', () => {
    renderForm();
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
    expect(dateInput).toBeInTheDocument();
    expect(dateInput.type).toBe('date');
    // Overlay pattern: invisible but full-size — the input ITSELF is the hit target
    expect(dateInput.className).toContain('opacity-0');
    expect(dateInput.className).toContain('absolute');
    expect(dateInput.className).not.toContain('sr-only');
    // Must NOT be nested inside a <button> (invalid HTML, untappable on iOS)
    expect(dateInput.closest('button')).toBeNull();
  });

  it('renders the time input as a real tappable overlay', () => {
    renderForm();
    const timeInput = screen.getByLabelText('Start Time') as HTMLInputElement;
    expect(timeInput.type).toBe('time');
    expect(timeInput.className).toContain('opacity-0');
    expect(timeInput.closest('button')).toBeNull();
  });

  it('disallows past dates via min=today (Riyadh)', () => {
    renderForm();
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
    expect(dateInput.min).toBe(todayInRiyadh());
  });

  it('wires date selection to setDate and shows the chosen date', () => {
    const setDate = vi.fn();
    renderForm({ date: '2026-09-01', setDate });
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-02' } });
    expect(setDate).toHaveBeenCalledWith('2026-09-02');
    // selected date renders in the display span (month short + day)
    expect(screen.getByText(/Sep 1/i)).toBeInTheDocument();
  });

  it('wires time selection to setTime', () => {
    const setTime = vi.fn();
    renderForm({ setTime });
    const timeInput = screen.getByLabelText('Start Time') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '18:30' } });
    expect(setTime).toHaveBeenCalledWith('18:30');
  });

  it('hides the pickers when date/time are slot-locked (koralink mode)', () => {
    renderForm({ readOnlyDateTime: true, date: '2026-09-01', time: '18:00' });
    expect(screen.queryByLabelText('Date')).toBeNull();
    expect(screen.queryByLabelText('Start Time')).toBeNull();
  });

  it('snaps the picked time to the nearest 10 minutes before saving', () => {
    const setTime = vi.fn();
    renderForm({ setTime });
    const timeInput = screen.getByLabelText('Start Time') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '18:37' } });
    expect(setTime).toHaveBeenCalledWith('18:40');
    fireEvent.change(timeInput, { target: { value: '18:32' } });
    expect(setTime).toHaveBeenCalledWith('18:30');
    fireEvent.change(timeInput, { target: { value: '18:58' } });
    expect(setTime).toHaveBeenCalledWith('19:00');
  });
});

describe('snapTimeTo10', () => {
  it('rounds to the nearest 10-minute mark', () => {
    expect(snapTimeTo10('18:37')).toBe('18:40');
    expect(snapTimeTo10('18:32')).toBe('18:30');
    expect(snapTimeTo10('18:30')).toBe('18:30'); // already snapped — unchanged
    expect(snapTimeTo10('00:04')).toBe('00:00');
  });

  it('wraps the hour and never rolls past 23:50', () => {
    expect(snapTimeTo10('18:58')).toBe('19:00');
    expect(snapTimeTo10('23:56')).toBe('23:50');
  });

  it('passes empty/invalid input through untouched', () => {
    expect(snapTimeTo10('')).toBe('');
  });
});
