import { describe, it, expect } from 'vitest';
import {
  isVenueOpenNow,
  riyadhDateKey,
  riyadhDayOfWeek,
  riyadhHour,
  type VenueHours,
} from '@/lib/venue-hours';

/**
 * P1-25 (run #17): venue operating-hours helpers. Riyadh is UTC+3 with no
 * DST, so fixed UTC instants map deterministically to local hours.
 */

const venue = (overrides: Partial<VenueHours> = {}): VenueHours => ({
  open_hour: 8,
  close_hour: 23,
  closed_day_0: false,
  closed_day_1: false,
  closed_day_2: false,
  closed_day_3: false,
  closed_day_4: false,
  closed_day_5: false,
  closed_day_6: false,
  ...overrides,
});

describe('riyadh clock helpers', () => {
  it('maps UTC instants to Riyadh-local hour/day/date (UTC+3, no DST)', () => {
    const noonRiyadh = new Date('2026-08-29T09:00:00Z'); // 12:00 Riyadh, Saturday
    expect(riyadhHour(noonRiyadh)).toBe(12);
    expect(riyadhDayOfWeek(noonRiyadh)).toBe(6); // Saturday
    expect(riyadhDateKey(noonRiyadh)).toBe('2026-08-29');

    // 01:00 Riyadh on Sunday 2026-08-30 === 22:00 UTC on Saturday.
    const earlySunday = new Date('2026-08-29T22:00:00Z');
    expect(riyadhHour(earlySunday)).toBe(1);
    expect(riyadhDayOfWeek(earlySunday)).toBe(0); // Sunday
    expect(riyadhDateKey(earlySunday)).toBe('2026-08-30');
  });
});

describe('isVenueOpenNow', () => {
  it('is open inside the window, closed before open (inclusive) and at close (exclusive)', () => {
    const v = venue();
    expect(isVenueOpenNow(v, new Date('2026-08-29T09:00:00Z'))).toBe(true); // 12:00 inside
    expect(isVenueOpenNow(v, new Date('2026-08-29T05:00:00Z'))).toBe(true); // 08:00 === open_hour → open
    expect(isVenueOpenNow(v, new Date('2026-08-29T04:00:00Z'))).toBe(false); // 07:00 before open
    expect(isVenueOpenNow(v, new Date('2026-08-29T20:00:00Z'))).toBe(false); // 23:00 === close_hour → closed
  });

  it('honours close_hour = 24 as midnight (23:xx still open)', () => {
    const v = venue({ close_hour: 24 });
    // 23:30 Riyadh === 20:30 UTC
    expect(isVenueOpenNow(v, new Date('2026-08-29T20:30:00Z'))).toBe(true);
    // 00:30 Riyadh next day === 21:30 UTC same UTC date → hour 0 → closed
    expect(isVenueOpenNow(v, new Date('2026-08-29T21:30:00Z'))).toBe(false);
  });

  it('is closed all day on a flagged weekday regardless of hours', () => {
    const v = venue({ closed_day_5: true }); // Friday closed
    // Friday 2026-08-28, 12:00 Riyadh === 09:00 UTC
    expect(isVenueOpenNow(v, new Date('2026-08-28T09:00:00Z'))).toBe(false);
    // Same time on Saturday is open.
    expect(isVenueOpenNow(v, new Date('2026-08-29T09:00:00Z'))).toBe(true);
  });
});
