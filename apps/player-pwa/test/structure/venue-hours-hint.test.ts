import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P2-281 M-1 — venue cards show today's pitch hours under the
 * "Available Now" filter (Reviewer B run #176: players booking late slots
 * need the closing time on the card, without a detour to the detail page).
 *
 * Structure-guard discipline (same as host-offline.test.ts): pins the
 * hours helper to isVenueOpenNow's closed-day source of truth and the
 * card wiring to the Available-Now-only condition, so the hint can never
 * silently disagree with the badge or leak onto other filter tabs.
 */
const PWA_ROOT = join(__dirname, '../..');
const PAGE = readFileSync(join(PWA_ROOT, 'src/app/[locale]/(main)/clubs/page.tsx'), 'utf-8');
const LIB = readFileSync(join(PWA_ROOT, 'src/lib/venue-hours.ts'), 'utf-8');
const EN = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/en.json'), 'utf-8'));
const AR = JSON.parse(readFileSync(join(PWA_ROOT, 'src/messages/ar.json'), 'utf-8'));

describe('P2-281 M-1 venue hours hint (structure)', () => {
  it('imports the shared hours helpers on the clubs page', () => {
    expect(PAGE).toContain("from '@/lib/venue-hours'");
    expect(PAGE).toContain('venueTodayHours');
    expect(PAGE).toContain('formatVenueHoursWindow');
  });

  it('shows hours ONLY under Available Now (openNow && activeFilter === \'Available Now\')', () => {
    expect(PAGE).toMatch(
      /openNow && activeFilter === 'Available Now'[\s\S]{0,300}venueTodayHours/,
    );
  });

  it('venueTodayHours shares isVenueOpenNow closed-day logic (same closed-day key)', () => {
    const closedDayUses = (LIB.match(/closed_day_\$\{riyadhDayOfWeek/g) ?? []).length;
    expect(closedDayUses).toBe(2);
  });

  it('clubs.hoursWindow exists in BOTH locales with the {open}/{close} slots', () => {
    expect(EN.clubs.hoursWindow).toContain('{open}');
    expect(EN.clubs.hoursWindow).toContain('{close}');
    expect(AR.clubs.hoursWindow).toContain('{open}');
    expect(AR.clubs.hoursWindow).toContain('{close}');
  });

  it('venueTodayHours returns null on a closed day, the window otherwise', async () => {
    const mod = await import('@/lib/venue-hours');
    const sunday = new Date('2026-01-04T10:00:00Z'); // Riyadh Sunday
    const wednesday = new Date('2026-01-07T10:00:00Z'); // Riyadh Wednesday
    expect(mod.venueTodayHours({ closed_day_0: true, open_hour: 8, close_hour: 23 }, sunday)).toBeNull();
    expect(mod.venueTodayHours({ open_hour: 8, close_hour: 23 }, wednesday)).toEqual({
      openHour: 8,
      closeHour: 23,
    });
  });
});
