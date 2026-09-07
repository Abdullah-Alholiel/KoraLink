import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import OfflineBanner from '@/components/layout/OfflineBanner';
import FilterBar, { type PlayFilters } from '@/components/matches/FilterBar';
import { useNow } from '@/hooks/useNow';

// next-intl: return keys as-is (no provider needed for these assertions)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `common.${key}`,
  useLocale: () => 'en',
}));

describe('OfflineBanner (P2-52 shared component, run #40)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('OB-1: renders the offline copy with role=status when offline (SR announce)', () => {
    render(<OfflineBanner isOffline />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('common.offlineBanner');
  });

  it('OB-2: renders NOTHING when online', () => {
    const { container } = render(<OfflineBanner isOffline={false} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('OB-3: default variant carries the canonical inline idiom (mx-4 mt-2, amber strip)', () => {
    render(<OfflineBanner isOffline />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('mx-4');
    expect(el.className).toContain('mt-2');
    expect(el.className).toContain('bg-amber-50');
    expect(el.className).toContain('border-amber-200');
  });

  it('OB-4: plain variant has NO margins — the caller owns spacing', () => {
    render(<OfflineBanner isOffline variant="plain" className="mx-4 mb-3" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('bg-amber-50');
    expect(el.className).not.toContain('mt-2');
    // Caller classes ride through
    expect(el.className).toContain('mx-4');
    expect(el.className).toContain('mb-3');
  });

  it('OB-5: caller className appends without clobbering the idiom', () => {
    render(<OfflineBanner isOffline className="mb-0" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('mb-0');
    expect(el.className).toContain('mx-4');
  });
});

describe('useNow hydration-safe clock', () => {
  it('NU-1: null during the first (hydration) render, real clock afterwards', () => {
    const seen: (number | null)[] = [];
    function Probe() {
      seen.push(useNow());
      return null;
    }
    render(<Probe />);
    // Render #1 (pre-effect — the hydration-equivalent render) saw null;
    // the effect then flipped the hook to the real clock.
    expect(seen[0]).toBeNull();
    expect(typeof seen[seen.length - 1]).toBe('number');
    expect((seen[seen.length - 1] as number) <= Date.now()).toBe(true);
    act(() => {
      /* quiet React act() warnings — DOM already settled */
    });
  });
});

describe('FilterBar a11y (P2-52, run #40)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('FB-A11Y: format chips expose aria-pressed and the 44px hit target', () => {
    // FilterBar is CONTROLLED — state must live in the harness for the
    // toggle flip to be observable.
    function Harness() {
      const [filters, setFilters] = useState<PlayFilters>({
        format: null,
        gender: null,
        maxPrice: null,
        time: null,
      });
      return <FilterBar filters={filters} onChange={setFilters} />;
    }
    render(<Harness />);
    const formatLabels = ['5v5', '7v7', '8v8', '11v11'];
    const formatChips = formatLabels.map((label) => screen.getByRole('button', { name: label }));
    expect(formatChips).toHaveLength(4);
    // All start unpressed
    formatChips.forEach((c) => expect(c.getAttribute('aria-pressed')).toBe('false'));
    // Toggling one flips its pressed state (controlled round-trip)
    fireEvent.click(formatChips[1]);
    expect(formatChips[1].getAttribute('aria-pressed')).toBe('true');
    expect(formatChips[0].getAttribute('aria-pressed')).toBe('false');
    // Hit-target token is on the class list
    expect(formatChips[0].className).toContain('min-h-hit');
  });
});
