'use client';

/**
 * P2-121 (run #83): logout-time privacy hygiene for the SW runtime caches.
 *
 * The chat/match/user runtime caches hold authenticated, per-user responses
 * (PR-Agent security MINOR on PR #46: cached DMs would stay readable in Cache
 * Storage on a shared device after logout, until expiry). Clearing them on
 * sign-out bounds that exposure; the NetworkOnly money/auth recipes never
 * cache anything by design, and precached static assets are unaffected.
 *
 * RUN-#84 ADDENDUM (Reviewer A IMPORTANT): the purge promise is recorded in
 * `lastRuntimeCachePurge` and exposed via `getLastRuntimeCachePurge()` so a
 * SIGN-OUT flow that hard-navigates right after (profile sign-out /
 * delete-account sheets, fetcher 401 redirect) can await it first — a bare
 * fire-and-forget `void` races the navigation and in-flight `caches.delete()`
 * microtasks can be aborted, leaving the previous user's caches readable on a
 * shared device exactly on the main logout path.
 */

/**
 * Exported for the drift-guard test (test/lib/sw-config.test.ts): the list
 * must stay in lockstep with the user-data runtimeCaching recipes in
 * next.config.mjs — a rename there without this list silently no-ops the
 * purge (PR-Agent MINOR, run #83).
 */
export const USER_RUNTIME_CACHES = [
  'conversation-messages-cache',
  'conversations-list-cache',
  'match-detail-cache',
  'user-profile-cache',
  'matches-feed-cache',
] as const;

let lastRuntimeCachePurge: Promise<void> = Promise.resolve();

/** The most recent purge promise — sign-out flows await this before navigating. */
export function getLastRuntimeCachePurge(): Promise<void> {
  return lastRuntimeCachePurge;
}

export function clearUserRuntimeCaches(): Promise<void> {
  const purge = (async () => {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    try {
      await Promise.all(
        USER_RUNTIME_CACHES.map(async (name) => {
          // may not exist yet — deleting a missing cache resolves false, fine.
          await caches.delete(name);
        }),
      );
    } catch {
      // Private-mode/quota errors must never break logout.
    }
  })();
  lastRuntimeCachePurge = purge;
  return purge;
}
