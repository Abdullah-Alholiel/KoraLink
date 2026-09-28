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
 * Fire-and-forget: logout must never hang or fail on cache cleanup.
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
] as const;

export async function clearUserRuntimeCaches(): Promise<void> {
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
}
