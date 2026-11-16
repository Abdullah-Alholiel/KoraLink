'use client';

/**
 * P2-315: mutation-triggered invalidation of the SW `match-detail-cache`.
 *
 * The service worker serves match-detail GETs NetworkFirst with a 1h
 * last-good fallback (next.config.mjs runtimeCaching). Match mutations
 * (join / leave / waitlist / cancel / start / complete) invalidate the React
 * Query caches, but a stale HTTP entry in Cache Storage could still be served
 * on a flaky/offline revisit — e.g. a joinable CTA up to 1h after the last
 * spot was taken. Cache Storage is shared between window and SW, so the page
 * purges the entries directly; no SW message handler is needed.
 *
 * Mirrors sw-cache-hygiene.ts: the promise is recorded so callers (or tests)
 * can await it, and errors are swallowed — fire-and-forget callers must
 * never break a mutation.
 */

/** Must match the match-detail recipe cacheName in next.config.mjs (drift-guarded). */
export const MATCH_DETAIL_CACHE = 'match-detail-cache';

let lastMatchDetailInvalidation: Promise<void> = Promise.resolve();

/** The most recent invalidation promise. */
export function getLastMatchDetailInvalidation(): Promise<void> {
  return lastMatchDetailInvalidation;
}

/**
 * True when `url`'s path is exactly the detail resource for `matchId`
 * (`.../api/v1/matches/<matchId>`), ignoring query string. Segment-exact so
 * id `1` never purges `/matches/12` or `/matches/1/messages`.
 */
function isDetailUrlFor(url: string, matchId: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return false;
  }
  const suffix = `/api/v1/matches/${encodeURIComponent(matchId)}`;
  return pathname === suffix || pathname.endsWith(suffix) || pathname.endsWith(`${suffix}/`);
}

export function invalidateMatchDetailCache(matchId?: string): Promise<void> {
  const purge = (async () => {
    if (typeof window === 'undefined' || !('caches' in window) || !window.caches) return;
    try {
      if (!matchId) {
        await caches.delete(MATCH_DETAIL_CACHE);
        return;
      }
      const cache = await caches.open(MATCH_DETAIL_CACHE);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((req) => isDetailUrlFor(req.url, matchId))
          .map((req) => cache.delete(req)),
      );
    } catch {
      // Private-mode/quota errors must never break a mutation.
    }
  })();
  lastMatchDetailInvalidation = purge;
  return purge;
}
