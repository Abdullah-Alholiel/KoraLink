import { describe, it, expect, vi } from 'vitest';

/**
 * P2-57 (run #51): SW runtime-caching contract — with the URL-REALITY suite.
 *
 * History that justifies this file's shape: the runtimeCaching patterns shipped
 * in run #18/#43 matched `/api/...` while real API URLs carry `/api/v1/...`
 * (API global prefix, apps/api/src/main.ts:118) — and workbox RegExpRoute tests
 * the FULL href including the query string (`regex.exec(url.href)`). The whole
 * caching table was therefore inert in every deployed environment, and the old
 * shape-only tests (checking `source` substrings) could not notice. The
 * "reality" suite below asserts patterns against real production-shaped URLs.
 */

// ── Mocks (before importing the config module) ──
vi.mock('@ducanh2912/next-pwa', () => ({
  default: (opts: Record<string, unknown>) => (nextConfig: Record<string, unknown>) => ({
    ...nextConfig,
    __pwaOpts: opts,
  }),
}));
vi.mock('next-intl/plugin', () => ({
  // Passthrough: in reality createNextIntlPlugin(...) returns a wrapper that
  // AUGMENTS an already-composed config object — it must not swallow the
  // __pwaOpts factory that the @ducanh2912/next-pwa mock produces below.
  default: () => (nextConfig: Record<string, unknown>) => nextConfig,
}));
vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: (cfg: Record<string, unknown>) => cfg,
}));

// next.config.mjs is at the app root; from test/lib/ that's ../../
// (Static types say NextConfig, but under the mocks above the default export
// IS the composed factory function — cast the dynamic import accordingly.)
const configModule = (await import('../../next.config.mjs')) as {
  default: { __pwaOpts?: { workboxOptions?: WorkboxOpts } };
};
// The config module's default export is the ALREADY-COMPOSED config object
// (withPWA(withNextIntl(...)) runs at module scope in next.config.mjs) —
// Next passes it through as-is; there is no factory call to make here.
const composed = configModule.default;

type RuntimeRecipe = {
  urlPattern: RegExp;
  handler: string;
  options?: {
    cacheName?: string;
    networkTimeoutSeconds?: number;
    expiration?: { maxAgeSeconds?: number; maxEntries?: number };
    cacheableResponse?: { statuses?: number[] };
  };
};

type WorkboxOpts = { runtimeCaching: RuntimeRecipe[] };

/** Dig the PWA workbox options out of the composed config object. */
function buildPwaOpts(): WorkboxOpts {
  const opts = composed?.__pwaOpts;
  if (!opts?.workboxOptions) throw new Error('withPWA options not found on composed config');
  return opts.workboxOptions;
}

const opts = buildPwaOpts();
const byCache = (name: string) =>
  opts.runtimeCaching.find((r) => r.options?.cacheName === name);
/** First recipe whose urlPattern matches this URL — workbox uses the FIRST match. */
const matchingRecipe = (url: string): RuntimeRecipe | undefined =>
  opts.runtimeCaching.find((r) => r.urlPattern instanceof RegExp && r.urlPattern.test(url));

// Real production-shaped origin (staging funnel; prod differs only in host).
const API = 'https://aa.tail2948f9.ts.net:8443/api/v1';

describe('SW runtime-caching contract (P2-57, run #51)', () => {
  it('exposes workboxOptions with runtimeCaching', () => {
    expect(Array.isArray(opts.runtimeCaching)).toBe(true);
  });

  it('recipe: matches feed (collection ONLY) is NetworkFirst with a TIGHT 60s window (run #18)', () => {
    const feed = byCache('matches-feed-cache');
    expect(feed?.handler).toBe('NetworkFirst');
    expect(feed?.options?.expiration?.maxAgeSeconds).toBe(60);
    expect(feed?.options?.networkTimeoutSeconds).toBe(3);
  });

  it('recipe: match-detail GETs get their own NetworkFirst recipe with a 1h offline window', () => {
    const detail = byCache('match-detail-cache');
    expect(detail).toBeTruthy();
    expect(detail?.handler).toBe('NetworkFirst');
    // Registered BEFORE the feed recipe so the more specific detail route wins
    // (workbox matches in registration order).
    const feedIdx = opts.runtimeCaching.findIndex(
      (r) => r.options?.cacheName === 'matches-feed-cache',
    );
    const detailIdx = opts.runtimeCaching.findIndex(
      (r) => r.options?.cacheName === 'match-detail-cache',
    );
    expect(detailIdx).toBeGreaterThanOrEqual(0);
    expect(detailIdx).toBeLessThan(feedIdx);
    expect(detail?.options?.expiration?.maxAgeSeconds).toBe(60 * 60);
    expect(detail?.options?.networkTimeoutSeconds).toBe(3);
    expect(detail?.options?.cacheableResponse?.statuses).toEqual([200]);
  });

  it('recipe: clubs/venues stay StaleWhileRevalidate (offline browsing)', () => {
    const clubs = byCache('clubs-venues-cache');
    expect(clubs?.handler).toBe('StaleWhileRevalidate');
    expect(clubs?.options?.cacheableResponse?.statuses).toEqual([200]);
    expect(clubs?.options?.expiration?.maxAgeSeconds).toBe(60 * 60 * 24);
  });

  // ── URL-REALITY suite: patterns must match REAL production URLs ──
  // Real URLs are cross-origin `${host}/api/v1/...` and carry query strings.
  describe('reality: real API URLs route to the right recipe', () => {
    it('feed URLs (with ?lat=&lng= geo query) hit matches-feed-cache', () => {
      expect(matchingRecipe(`${API}/matches?lat=24.71&lng=46.67&radius=5000`)?.options?.cacheName).toBe(
        'matches-feed-cache',
      );
      expect(matchingRecipe(`${API}/matches`)?.options?.cacheName).toBe('matches-feed-cache');
    });

    it('detail URLs (single id segment, with or without query) hit match-detail-cache', () => {
      expect(matchingRecipe(`${API}/matches/9f3c2a1e-4b5d-4c6a-8e2f-010203040506`)?.options?.cacheName).toBe(
        'match-detail-cache',
      );
      expect(matchingRecipe(`${API}/matches/9f3c2a1e?view=full`)?.options?.cacheName).toBe(
        'match-detail-cache',
      );
    });

    it('multi-segment match sub-resources (chat, pom-result, calendar) hit NO cache recipe', () => {
      // Chat must never serve stale from SW — freshness is handled by React Query.
      expect(matchingRecipe(`${API}/matches/9f3c2a1e/messages`)).toBeUndefined();
      expect(matchingRecipe(`${API}/matches/9f3c2a1e/pom-result`)).toBeUndefined();
      expect(matchingRecipe(`${API}/matches/9f3c2a1e/calendar`)).toBeUndefined();
    });

    it('clubs/venues (collection + detail + query) hit clubs-venues-cache', () => {
      expect(matchingRecipe(`${API}/venues?city=Riyadh`)?.options?.cacheName).toBe('clubs-venues-cache');
      expect(matchingRecipe(`${API}/venues/v-uuid-123`)?.options?.cacheName).toBe('clubs-venues-cache');
      expect(matchingRecipe(`${API}/clubs/c-uuid-123?tab=1`)?.options?.cacheName).toBe('clubs-venues-cache');
    });

    it('own-profile reads hit user-profile-cache; OTHER users do not', () => {
      expect(matchingRecipe(`${API}/users/me`)?.options?.cacheName).toBe('user-profile-cache');
      expect(matchingRecipe(`${API}/users/me/notifications`)?.options?.cacheName).toBe(
        'user-profile-cache',
      );
      expect(matchingRecipe(`${API}/users/someone-else-id`)).toBeUndefined();
    });

    it('conversations LIST (with or without query) hits conversations-list-cache (P2-102, run #75)', () => {
      // The exact URL the Messages screen fetches (useConversations.ts).
      expect(
        matchingRecipe(`${API}/conversations?page=1&perPage=30`)?.options?.cacheName,
      ).toBe('conversations-list-cache');
      expect(matchingRecipe(`${API}/conversations`)?.options?.cacheName).toBe(
        'conversations-list-cache',
      );
    });

    it('conversation THREADS (/:id/messages) get their own NetworkFirst recipe (P2-121, run #83 — mirrors match-detail)', () => {
      const threads = byCache('conversation-messages-cache');
      expect(threads?.handler).toBe('NetworkFirst');
      expect(threads?.options?.expiration?.maxAgeSeconds).toBe(3600);
      expect(threads?.options?.networkTimeoutSeconds).toBe(3);
      expect(threads?.options?.cacheableResponse?.statuses).toEqual([200]);
      // Real thread URLs route into the thread cache…
      expect(matchingRecipe(`${API}/conversations/9f3c2a1e/messages`)).toBe(threads);
      expect(matchingRecipe(`${API}/conversations/9f3c2a1e/messages?after=123`)).toBe(threads);
      // …while the LIST URL still routes into the list cache (end-anchored).
      expect(matchingRecipe(`${API}/conversations`)).toBe(byCache('conversations-list-cache'));
      expect(matchingRecipe(`${API}/conversations?page=2`)).toBe(
        byCache('conversations-list-cache'),
      );
      // Auth/money NetworkOnly recipes keep priority (registered first).
      expect(matchingRecipe(`${API}/wallet`)?.handler).toBe('NetworkOnly');
    });

    it('recipe: conversations list is NetworkFirst with a 1h offline window (P2-102, run #75)', () => {
      const convos = byCache('conversations-list-cache');
      expect(convos?.handler).toBe('NetworkFirst');
      expect(convos?.options?.expiration?.maxAgeSeconds).toBe(60 * 60);
      expect(convos?.options?.networkTimeoutSeconds).toBe(3);
      expect(convos?.options?.cacheableResponse?.statuses).toEqual([200]);
    });

    // P2-121 (run #83, PR-Agent MINOR drift guard): the logout purge list must
    // stay in lockstep with the user-data recipes above — a recipe rename (or
    // a new user-scoped cache) without updating sw-cache-hygiene.ts would make
    // caches.delete() silently no-op and leak per-user data across sign-out.
    it('logout purge list covers EXACTLY the user-data runtime caches (drift guard)', async () => {
      const { USER_RUNTIME_CACHES } = await import('@/lib/sw-cache-hygiene');
      const userDataRecipes = opts.runtimeCaching
        .map((r) => r.options?.cacheName)
        .filter((n): n is string => typeof n === 'string');
      expect([...USER_RUNTIME_CACHES].sort()).toEqual([...userDataRecipes].sort());
      // Money/auth NetworkOnly recipes carry no cacheName by design — the
      // purge list can never be padded with unrelated names.
      expect(opts.runtimeCaching.filter((r) => !r.options?.cacheName).length).toBe(3);
    });

    it('money + auth URLs are NetworkOnly (never cached) — behavior-level', () => {
      const moneyAuth = [
        `${API}/auth/dev-login`,
        `${API}/auth/verify-otp`,
        `${API}/wallet`,
        `${API}/wallet/transactions?page=1`,
        `${API}/payments/initiate`,
        'https://cdn.moyasar.com/v1/moyasar.js',
      ];
      for (const url of moneyAuth) {
        const recipe = matchingRecipe(url);
        expect(recipe, `no recipe matched ${url}`).toBeTruthy();
        expect(recipe?.handler, `${url} must be NetworkOnly`).toBe('NetworkOnly');
      }
    });

    it('legacy non-v1 API paths match nothing (patterns are strictly v1-scoped)', () => {
      expect(matchingRecipe('https://aa.tail2948f9.ts.net:8443/api/matches?lat=1')).toBeUndefined();
    });
  });

  it('every cacheable recipe pins statuses [200] — opaque (status 0) never cached (run #43)', () => {
    const cacheable = opts.runtimeCaching.filter((r) => r.handler !== 'NetworkOnly');
    expect(cacheable.length).toBeGreaterThan(0);
    for (const r of cacheable) {
      expect(r.options?.cacheableResponse?.statuses).toEqual([200]);
    }
  });
});
