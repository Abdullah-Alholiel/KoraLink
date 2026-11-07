/**
 * P2-rider (run #133) — locale-aware clock times from the adapters.
 *
 * Pins the DECISIONS.md EN+AR marketing standard at the data layer:
 * ar renders Arabic-Indic digits + Arabic meridiem (Gregorian-pinned —
 * no Hijri drift), en stays byte-identical to the legacy en-US output
 * (structural: the default 'en' path issues the exact same en-US
 * toLocaleTimeString call as the pre-rider code, so exact-string pins
 * would only couple the test to the runner's TZ — shape pins instead).
 */

import { describe, it, expect } from 'vitest';
import { adaptNearbyMatch, adaptTransaction } from '@/lib/api-adapter';
import type { NearbyMatchApi, TransactionApi } from '@/lib/api-adapter';

// Riyadh = UTC+3 fixed — 10:00Z is 13:00 wall time year-round.
const SCHEDULED_AT = '2026-10-15T10:00:00.000Z';

function baseRow(overrides: Partial<NearbyMatchApi> = {}): NearbyMatchApi {
  return {
    id: 'm1',
    title: 'Test match',
    match_type: 'Casual',
    gender_rule: 'mixed',
    status: 'Open',
    scheduled_at: SCHEDULED_AT,
    duration_mins: 90,
    price_per_player: '37.50',
    spots_filled: 3,
    max_players: 10,
    host_id: 'host1',
    host_name: 'Host',
    host_avatar: null,
    pitch_id: null,
    pitch_name: null,
    venue_id: null,
    venue_name: null,
    venue_city: 'Riyadh',
    pitch_size: '7v7',
    pitch_surface: null,
    distance_m: null,
    is_joined: false,
    has_voted: false,
    visibility: 'public',
    booking_mode: 'koralink',
    is_player_hosted: false,
    ...overrides,
  } as NearbyMatchApi;
}

describe('P2-rider: adapter clock times follow the active locale', () => {
  it('en keeps the legacy en-US shape (Latin digits, AM/PM)', () => {
    const m = adaptNearbyMatch(baseRow());
    expect(m.time).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    expect(m.endTime).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    // Byte-identity to legacy: same call with explicit default.
    expect(adaptNearbyMatch(baseRow(), undefined, 'en').time).toBe(m.time);
  });

  it('ar renders Arabic-Indic digits + Arabic meridiem (Gregorian-pinned)', () => {
    const m = adaptNearbyMatch(baseRow(), undefined, 'ar');
    // Arabic-Indic digit class + Arabic meridiem (ص/م); never Latin AM/PM.
    expect(m.time).toMatch(/^[٠-٩]{1,2}:[٠-٩]{2} [صم]$/);
    expect(m.endTime).toMatch(/^[٠-٩]{1,2}:[٠-٩]{2} [صم]$/);
    expect(m.time).not.toMatch(/[AP]M/);
    expect(m.time).not.toMatch(/[0-9]/);
  });

  it('adaptTransaction description renders the clock time in the active locale', () => {
    const row = {
      id: 't1',
      type: 'credit',
      amount: '10.00',
      status: 'Completed',
      reference_type: 'refund',
      reference_id: 'r1',
      created_at: SCHEDULED_AT,
    } as unknown as TransactionApi;
    const en = adaptTransaction(row);
    expect(en.description).toMatch(/^\d{1,2}:\d{2} (AM|PM) • Completed$/);
    const ar = adaptTransaction(row, 'ar');
    expect(ar.description).toMatch(/^[٠-٩]{1,2}:[٠-٩]{2} [صم] • Completed$/);
  });
});
