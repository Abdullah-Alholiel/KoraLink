/**
 * Adapter status-truth regression (2026-09-18 "Ladies Night went live" bug).
 *
 * The adapters used to FABRICATE `in_progress` from the client clock — any
 * Open/Full match inside its play window was overridden to `in_progress`
 * regardless of roster or real status, so a below-minimum match displayed
 * "Live Now" and "Join Ongoing Match". The DB status (already effective-status
 * resolved server-side: underfilled past-end reads Cancelled via
 * resolveEffectiveStatus) is the single source of truth — the adapter must
 * map it 1:1 and never derive lifecycle state from the wall clock.
 */
import { describe, expect, it } from 'vitest';
import { adaptNearbyMatch, adaptMatchDetail, type NearbyMatchApi, type MatchDetailApi } from './api-adapter';

/** A match whose play window is ACTIVE right now (started 10 min ago, 60-min duration). */
function inWindowRow(overrides: Partial<NearbyMatchApi> = {}): NearbyMatchApi {
  const start = new Date(Date.now() - 10 * 60_000);
  return {
    id: 'm-live',
    title: 'Ladies Night 7v7',
    match_type: 'Casual',
    gender_rule: 'Women Only',
    status: 'Open',
    scheduled_at: start.toISOString(),
    duration_mins: 60,
    price_per_player: 30,
    max_players: 14,
    spots_filled: 7,
    distance_m: null,
    host_id: 'host-1',
    host_name: 'Noura Al-Asiri',
    host_avatar: null,
    pitch_id: 'pitch-1',
    pitch_name: 'Pitch F – Ladies Court',
    pitch_size: '7v7',
    pitch_surface: 'Grass',
    venue_name: 'Malqa Ladies Arena',
    venue_city: 'Riyadh',
    is_joined: false,
    ...overrides,
  };
}

function detailRow(overrides: Partial<MatchDetailApi> = {}): MatchDetailApi {
  return {
    id: 'm-live',
    title: 'Ladies Night 7v7',
    host_id: 'host-1',
    match_type: 'Casual',
    gender_rule: 'Women Only',
    status: 'Open',
    scheduled_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    duration_mins: 60,
    completed_at: null,
    price_per_player: '30.00',
    max_players: 14,
    host: { id: 'host-1', full_name: 'Noura Al-Asiri', handle: 'noura_a', avatar_url: null, karma_score: 8 },
    pitch: {
      id: 'pitch-1',
      name: 'Pitch F – Ladies Court',
      size: '7v7',
      surface_type: 'Grass',
      venue: { id: 'v-1', name: 'Malqa Ladies Arena', city: 'Riyadh', address: 'Al-Malqa', amenities: [] },
    },
    players: [],
    messages: [],
    booking_mode: 'self',
    is_player_hosted: false,
    host_payout_state: 'not_applicable',
    visibility: 'public',
    ...overrides,
  } as unknown as MatchDetailApi;
}

describe('adaptNearbyMatch — status is DB-truth, never clock-derived', () => {
  it('keeps an Open match Open even when its play window is active (Ladies Night bug)', () => {
    const match = adaptNearbyMatch(inWindowRow({ status: 'Open', spots_filled: 7 }));
    expect(match.status).toBe('open');
  });

  it('keeps a below-minimum Full match Full inside its window', () => {
    const match = adaptNearbyMatch(inWindowRow({ status: 'Full', spots_filled: 5 }));
    expect(match.status).toBe('full');
  });

  it('maps a genuinely InProgress match to in_progress (host pressed Start)', () => {
    const match = adaptNearbyMatch(inWindowRow({ status: 'InProgress' }));
    expect(match.status).toBe('in_progress');
  });

  it('maps terminal statuses verbatim regardless of the clock', () => {
    expect(adaptNearbyMatch(inWindowRow({ status: 'Cancelled' })).status).toBe('cancelled');
    expect(adaptNearbyMatch(inWindowRow({ status: 'Completed' })).status).toBe('completed');
  });
});

describe('adaptMatchDetail — status is DB-truth, never clock-derived', () => {
  it('keeps an Open match Open inside its play window (Ladies Night bug)', () => {
    const match = adaptMatchDetail(detailRow({ status: 'Open' }));
    expect(match.status).toBe('open');
  });

  it('maps a genuinely InProgress match to in_progress', () => {
    const match = adaptMatchDetail(detailRow({ status: 'InProgress' }));
    expect(match.status).toBe('in_progress');
  });

  it('reads an underfilled past-end match as Cancelled (server already resolved it)', () => {
    const match = adaptMatchDetail(
      detailRow({
        status: 'Cancelled',
        scheduled_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      }),
    );
    expect(match.status).toBe('cancelled');
  });
});
