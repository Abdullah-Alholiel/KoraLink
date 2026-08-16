import { describe, it, expect } from 'vitest';
import { riyadhISO } from '@/lib/api-adapter';

describe('riyadhISO', () => {
  it('converts Riyadh-local 18:00 to 15:00 UTC (UTC+3, no DST)', () => {
    expect(riyadhISO('2026-08-16', '18:00')).toBe('2026-08-16T15:00:00.000Z');
  });

  it('wraps midnight to the previous day in UTC', () => {
    expect(riyadhISO('2026-08-16', '00:00')).toBe('2026-08-15T21:00:00.000Z');
  });

  it('preserves minutes', () => {
    expect(riyadhISO('2026-08-16', '18:30')).toBe('2026-08-16T15:30:00.000Z');
  });
});
