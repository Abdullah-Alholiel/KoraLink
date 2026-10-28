import { describe, it, expect, beforeAll } from 'vitest';
import { mediaUrl, firstVenueImage } from '@/lib/media-url';

/**
 * P2-269 (run #171): managed venue-image path → cross-origin media URL.
 * The managed-prefix guard is the XSS/foreign-content contract: values in
 * the jsonb venues.images column that are NOT `/media/venues/...` paths
 * (admin/partner-writable) must never become <img src>.
 */
const ORIGIN = 'https://media.example';
const url = (p: string) => `${ORIGIN}${p}`;

beforeAll(() => {
  // trailing slash + /api/v1 suffix both present — pins the strip behavior
  process.env.NEXT_PUBLIC_API_URL = 'https://media.example/api/v1/';
});

describe('mediaUrl', () => {
  it('builds the API-origin URL for a managed path', () => {
    expect(mediaUrl('/media/venues/abc-123/def.jpg')).toBe(url('/media/venues/abc-123/def.jpg'));
  });

  it('rejects foreign paths (no managed prefix)', () => {
    expect(mediaUrl('https://evil.example/x.jpg')).toBeNull();
    expect(mediaUrl('/uploads/sneaky.jpg')).toBeNull();
    expect(mediaUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects empty/null/undefined', () => {
    expect(mediaUrl('')).toBeNull();
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
  });

  it('rejects paths with traversal or stray characters', () => {
    expect(mediaUrl('/media/venues/../secret')).toBeNull();
    expect(mediaUrl('/media/venues/a b.jpg')).toBeNull();
  });
});

describe('firstVenueImage', () => {
  it('returns the first renderable URL', () => {
    expect(
      firstVenueImage(['/media/venues/v1/a.jpg', '/media/venues/v1/b.jpg']),
    ).toBe(url('/media/venues/v1/a.jpg'));
  });

  it('returns null (not a PWA-relative URL) when the API env is unset (PR-Agent r2)', () => {
    const saved = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    try {
      expect(mediaUrl('/media/venues/v1/a.jpg')).toBeNull();
      expect(firstVenueImage(['/media/venues/v1/a.jpg'])).toBeNull();
    } finally {
      process.env.NEXT_PUBLIC_API_URL = saved;
    }
  });

  it('skips foreign entries and finds the first managed one', () => {
    expect(firstVenueImage(['https://evil.example/x.jpg', '/media/venues/v1/ok.jpg'])).toBe(
      url('/media/venues/v1/ok.jpg'),
    );
  });

  it('returns null for empty array / missing / malformed shapes', () => {
    expect(firstVenueImage([])).toBeNull();
    expect(firstVenueImage(undefined)).toBeNull();
    expect(firstVenueImage(null)).toBeNull();
    expect(firstVenueImage('not-an-array')).toBeNull();
    expect(firstVenueImage([42])).toBeNull();
  });
});
