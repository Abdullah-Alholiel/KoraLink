import { describe, it, expect } from 'vitest';
import { formatDistance } from '@/lib/format';

describe('formatDistance', () => {
  it('returns null for null, undefined, or NaN', () => {
    expect(formatDistance(null, 'en')).toBeNull();
    expect(formatDistance(undefined, 'en')).toBeNull();
    expect(formatDistance(Number.NaN, 'en')).toBeNull();
  });

  it('formats sub-kilometre distances with metre unit (en)', () => {
    expect(formatDistance(0, 'en')).toBe('0 m');
    expect(formatDistance(850, 'en')).toBe('850 m');
    expect(formatDistance(999, 'en')).toBe('999 m');
  });

  it('formats kilometre distances with one decimal (en)', () => {
    expect(formatDistance(1000, 'en')).toBe('1 km');
    expect(formatDistance(3200, 'en')).toBe('3.2 km');
  });

  it('formats Arabic using Hindi numerals and Arabic units', () => {
    expect(formatDistance(850, 'ar')).toBe('٨٥٠ م');
    expect(formatDistance(3200, 'ar')).toBe('٣٫٢ كم');
  });

  it('rounds metres to a whole number', () => {
    expect(formatDistance(850.6, 'en')).toBe('851 m');
  });
});
