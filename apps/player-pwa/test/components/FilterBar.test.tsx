import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar, { type PlayFilters } from '@/components/matches/FilterBar';

// next-intl: return keys as-is (no provider needed for these assertions)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

const base: PlayFilters = {
  format: null,
  gender: null,
  maxPrice: null,
  time: null,
};

function renderBar(overrides: Partial<PlayFilters> = {}) {
  const onChange = vi.fn();
  render(<FilterBar filters={{ ...base, ...overrides }} onChange={onChange} />);
  return { onChange };
}

describe('FilterBar time-of-day filter (run #12)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function openSheet() {
    // The filter trigger is icon-only (no accessible name) and is the last
    // button in the bar, after the four format chips.
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
  }

  it('FB-T1: lists the four time-of-day presets in the sheet', () => {
    renderBar();
    openSheet();
    expect(screen.getByText('play.filters.time.morning')).toBeTruthy();
    expect(screen.getByText('play.filters.time.afternoon')).toBeTruthy();
    expect(screen.getByText('play.filters.time.evening')).toBeTruthy();
    expect(screen.getByText('play.filters.time.night')).toBeTruthy();
  });

  it('FB-T2: tapping a time chip emits onChange with that value and keeps other filters', () => {
    const { onChange } = renderBar({ format: '7v7' });
    openSheet();

    fireEvent.click(screen.getByText('play.filters.time.evening'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({
      ...base,
      format: '7v7',
      time: 'evening',
    });
  });

  it('FB-T3: tapping the active time chip again clears it', () => {
    const { onChange } = renderBar({ time: 'evening' });
    openSheet();

    fireEvent.click(screen.getByText('play.filters.time.evening'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ ...base, time: null });
  });

  it('FB-T4: switching from one preset to another emits only the new value', () => {
    const { onChange } = renderBar({ time: 'morning' });
    openSheet();

    fireEvent.click(screen.getByText('play.filters.time.night'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ ...base, time: 'night' });
  });
});
