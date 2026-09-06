import { describe, it, expect } from 'vitest';
import { formatDistance, formatDateSection, formatRelativeTime, formatTimeLeft } from '@/lib/format';

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

describe('formatDateSection', () => {
  it('formats English as "day name, number month year"', () => {
    expect(formatDateSection('2026-08-14', 'en')).toBe('Friday, 14 August 2026');
  });

  it('formats Arabic with weekday/month and Hindi numerals (Gregorian)', () => {
    expect(formatDateSection('2026-08-14', 'ar')).toBe('الجمعة، ١٤ أغسطس ٢٠٢٦');
  });
});

describe('formatRelativeTime', () => {
  it('returns "now" for a future or invalid timestamp', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(formatRelativeTime(future, 'en')).toBe('now');
    expect(formatRelativeTime('not-a-date', 'en')).toBe('now');
  });

  it('returns a relative string for a recent past timestamp', () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(recent, 'en')).toBe('5m ago');
  });
});

describe('formatTimeLeft', () => {
  const NOW = new Date('2026-09-06T12:00:00Z');

  it('formats hours + minutes (en)', () => {
    expect(formatTimeLeft('2026-09-06T17:32:00Z', 'en', NOW)).toEqual({
      text: '5h 32m',
      minutesLeft: 332,
    });
  });

  it('formats hours + minutes with Hindi numerals (ar)', () => {
    expect(formatTimeLeft('2026-09-06T17:32:00Z', 'ar', NOW)).toEqual({
      text: '٥ س ٣٢ د',
      minutesLeft: 332,
    });
  });

  it('formats minutes only when under an hour (en + ar)', () => {
    const target = new Date('2026-09-06T12:45:00Z');
    expect(formatTimeLeft(target, 'en', NOW)).toEqual({ text: '45m', minutesLeft: 45 });
    expect(formatTimeLeft(target, 'ar', NOW)).toEqual({ text: '٤٥ د', minutesLeft: 45 });
  });

  it('returns the under-a-minute chunk for sub-minute deadlines', () => {
    const target = new Date('2026-09-06T12:00:30Z');
    expect(formatTimeLeft(target, 'en', NOW)).toEqual({ text: 'under a minute', minutesLeft: 0 });
    expect(formatTimeLeft(target, 'ar', NOW)).toEqual({ text: 'أقل من دقيقة', minutesLeft: 0 });
  });

  it('returns null once the deadline has passed', () => {
    expect(formatTimeLeft('2026-09-06T11:59:00Z', 'en', NOW)).toBeNull();
  });

  it('returns null for an invalid timestamp', () => {
    expect(formatTimeLeft('not-a-date', 'en', NOW)).toBeNull();
  });
});
