import { describe, it, expect } from 'vitest';
import { adaptNearbyMatch, adaptMatchDetail } from '@/lib/api-adapter';

describe('visibility field propagation (DB → adapter → Match)', () => {
  const baseRow = {
    id: 'm1',
    title: 'Private Kickabout',
    match_type: 'Casual',
    gender_rule: 'Men Only',
    status: 'Open',
    scheduled_at: '2026-08-20T17:00:00.000Z',
    duration_mins: 60,
    price_per_player: 37,
    max_players: 14,
    spots_filled: 3,
    distance_m: 1200,
    host_id: 'host-1',
    host_name: 'Host',
    host_avatar: null,
    pitch_id: 'p1',
    pitch_name: 'Pitch 1',
    pitch_size: '7v7',
    pitch_surface: 'Grass',
    venue_name: 'KSU Stadium',
    venue_city: 'Riyadh',
    is_joined: false,
  };

  it('maps visibility=private → isPrivate=true on feed rows', () => {
    const m = adaptNearbyMatch({ ...baseRow, visibility: 'private' });
    expect(m.isPrivate).toBe(true);
  });

  it('maps visibility=public → isPrivate=false on feed rows', () => {
    const m = adaptNearbyMatch({ ...baseRow, visibility: 'public' });
    expect(m.isPrivate).toBe(false);
  });

  it('treats missing visibility as public (backfill-safe)', () => {
    const m = adaptNearbyMatch(baseRow);
    expect(m.isPrivate).toBe(false);
  });

  it('maps visibility on match detail rows', () => {
    const detail = {
      id: 'm1',
      title: 'Private Kickabout',
      host_id: 'host-1',
      match_type: 'Casual',
      gender_rule: 'Men Only',
      status: 'Open',
      scheduled_at: '2026-08-20T17:00:00.000Z',
      duration_mins: 60,
      price_per_player: '37',
      max_players: 14,
      visibility: 'private',
      host: { id: 'host-1', full_name: 'Host', handle: null, avatar_url: null, karma_score: 10 },
      pitch: {
        name: 'Pitch 1', size: '7v7', surface_type: 'Grass',
        venue: { name: 'KSU Stadium', city: 'Riyadh', address: 'X', amenities: [] },
      },
      players: [],
      messages: [],
    };
    const m = adaptMatchDetail(detail);
    expect(m.isPrivate).toBe(true);
  });
});
