/**
 * Offline restore bridge (P2-73, run #64).
 *
 * The service worker (worker/index.js) saves the URL of a failed offline
 * navigation into a tiny Cache-API KV (`koralink-offline-restore`) before
 * serving the offline page; this module is the page-side reader. The worker
 * clears the entry on the next SUCCESSFUL document navigation, so the saved
 * target never outlives the offline journey (plus the 24h TTL below).
 *
 * Deliberately free of module-scope window/caches access so it is
 * unit-testable under jsdom and safe to import from a client page.
 */

export const RESTORE_CACHE = 'koralink-offline-restore';
export const RESTORE_KEY = '/__kl/restore-url';

/** Entries older than this are stale and silently dropped on read. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A save this fresh means the offline page was just served by the SW catch. */
export const FRESH_SAVE_MS = 15_000;

export interface RestoreEntry {
  url: string;
  savedAt: number;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Read the saved restore entry, if any. Returns null when there is no entry,
 * the payload is malformed, the URL is not http(s), or the entry is older
 * than 24h — invalid/stale entries are removed on read (self-healing).
 */
export async function readRestoreEntry(): Promise<RestoreEntry | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(RESTORE_CACHE);
    const stored = await cache.match(RESTORE_KEY);
    if (!stored) return null;
    const raw: unknown = await stored.json();
    const record = (raw ?? {}) as { u?: unknown; t?: unknown };
    const url = record.u;
    const savedAt = typeof record.t === 'number' ? record.t : Number.NaN;
    const invalid = !isHttpUrl(url) || !Number.isFinite(savedAt);
    const stale = Number.isFinite(savedAt) && Date.now() - savedAt > MAX_AGE_MS;
    if (invalid || stale) {
      await cache.delete(RESTORE_KEY);
      return null;
    }
    return { url, savedAt };
  } catch {
    return null;
  }
}
