/**
 * Venue photo URL builder (P2-269, run #171).
 *
 * `venues.images` rows are MANAGED paths written exclusively by the API media
 * service (`/media/venues/<venueId>/<sha256>.<ext>` — migration 0057 jsonb,
 * admin/partner uploads through POST /media/venues). The values live in a
 * jsonb column that admins/partners can technically write arbitrary strings
 * into, so the UI accepts ONLY the managed prefix (no `..`, no stray chars)
 * and renders through React attribute binding — an injected `javascript:` or
 * off-site URL can never become an `<img src>` (it falls back to the letter
 * avatar instead).
 */

const MANAGED_IMAGE_RE = /^\/media\/venues\/[A-Za-z0-9/._-]+$/;

/**
 * Full URL for one managed venue-image path, or null when the path is
 * missing/foreign (caller renders its fallback state).
 */
export function mediaUrl(path: string | undefined | null): string | null {
  if (!path || !MANAGED_IMAGE_RE.test(path) || path.includes('..')) return null;
  // Resolved per call so vitest can set the env in beforeAll (module-load
  // order would otherwise bake an empty origin into the test run).
  const origin = (process.env.NEXT_PUBLIC_API_URL ?? '')
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/, '');
  return `${origin}${path}`;
}

/** First renderable photo URL for a venue images array (null = fallback). */
export function firstVenueImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const p of images) {
    if (typeof p === 'string') {
      const url = mediaUrl(p);
      if (url) return url;
    }
  }
  return null;
}
