# Run #75 — DB & Infra lane (75%4=3): SW offline cache-route completion (P2-102)

## Gate 0 — Retro (audit of the lane this item touches)

- Recent lane commits: `3d4cb7f` (reminder ladder + migration 0044), `582dcb3` (typing relay) —
  both verified this run (see RUNS report). The SW caching table lives in `next.config.mjs`
  (source) → compiled into `public/sw.js` by @ducanh2912/next-pwa at build. Contract suite:
  `test/lib/sw-config.test.ts` (P2-57 URL-REALITY suite, run #51 — patterns must match REAL
  cross-origin `/api/v1/...` URLs; workbox matches full href incl. query; first match wins).
- Standing bug classes swept by Reviewer A this run: ALL CLEAN (12 classes). No `::uuid`,
  no `eq(col,null)`, journal/sha256 conventions intact, snapshot-chain pin extended to 0044.
- Prior art in the caching table: money/auth = NetworkOnly (FIRST, deliberately — static-assets
  CacheFirst would otherwise shadow the Moyasar SDK `.js`); feed = NetworkFirst 60s; match-detail
  = NetworkFirst 1h; clubs/venues = StaleWhileRevalidate 24h; users/me + sub-resources =
  NetworkFirst 5min. Static assets CacheFirst 30d. All cacheable recipes pin `statuses: [200]`
  (opaque-response poison rule, run #43) and end with `handlerDidError → self.fallback(e)`.
- Document navigations offline are handled locale-aware by `worker/index.js` (P2-73/P2-80) —
  this item is API-response caching ONLY, orthogonal.

## Gate 1 — Product spec

- **Problem:** offline (or dead-network) openings of the Messages/Discussions screen render the
  empty state instead of the last-seen conversation list — the screen has no SW cache route.
  Board row P2-102 (Reviewer B, run #72) claimed three gaps: conversations list, wallet balance,
  my-games.
- **Re-scope with live evidence (claims ≠ facts):**
  - my-games: **ALREADY CACHED** — both `useMyMatches()` implementations fetch
    `/users/me/matches` (src/hooks/useMessages.ts:56, src/hooks/useUser.ts:262), which matches
    the shipped `/users/me(?:/.*)?` user-profile-cache recipe (next.config.mjs:153).
  - wallet: **DELIBERATELY UNCACHED** — `/api/v1/wallet` is NetworkOnly by the money rule
    (next.config.mjs:47, test-pinned in sw-config.test.ts:151-165). Never cache financial data.
  - conversations list: **REAL GAP** — `GET /conversations?page=N&perPage=30`
    (src/hooks/useConversations.ts:136) matches NO recipe.
- **Scope:** IN = one collection-level cache recipe for the conversations list + reality-suite
  pins + board correction. OUT = message-thread caching (`/conversations/:id/messages` stays
  uncached — chat freshness is React Query's job, same policy as match chat sub-resources),
  offline mutation queue (P2-7/P2-46, parked by owner).
- **Success criteria:** offline opening of the Messages screen shows the last-fetched list;
  reality tests prove the list URL routes to the new cache and thread URLs match nothing;
  full gates green.

## Gate 2 — Architecture

- One new recipe in `next.config.mjs` `workboxOptions.runtimeCaching`, registered after the
  user-profile recipe. No ordering hazard: no existing recipe matches `/api/v1/conversations*`
  (static-assets extension pattern can't match an extensionless API URL).
- Handler: **NetworkFirst** (not SWR) — conversations reorder on every new message; stale-first
  would pin a reordered list for the whole session. Offline → fetch rejects immediately → cache
  served instantly; `networkTimeoutSeconds: 3` only bites on slow networks (feed/detail precedent).
- TTL: 1h / 10 entries — bounds offline-fallback staleness; refreshed on every online visit.
- `statuses: [200]` pinned (opaque-poison rule); GET-only (workbox registerRoute default method).

## Gate 3 — Program design (contract)

- New runtime recipe (exact shape appended to `runtimeCaching`):
  ```js
  {
    urlPattern: /^https?:\/\/[^/]+\/api\/v1\/conversations(?:\?.*)?$/,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'conversations-list-cache',
      networkTimeoutSeconds: 3,
      expiration: { maxAgeSeconds: 3600, maxEntries: 10 },
      cacheableResponse: { statuses: [200] },
    },
  },
  ```
  End-anchor `(?:\?.*)?$` ⇒ `/conversations/:id/messages` and `POST /conversations` match
  NOTHING (threads stay network-only-by-absence; POST excluded by GET-only registration).
- Test contract (test/lib/sw-config.test.ts additions):
  1. recipe block: handler NetworkFirst, statuses [200], maxAge 3600.
  2. reality: `${API}/conversations?page=1&perPage=30` and `${API}/conversations` →
     conversations-list-cache; `${API}/conversations/<id>/messages` → undefined.
- i18n: none (no UI copy). Observability: none needed (cache layer, no new error surface;
  failures surface through the existing fetcher error states).

### Contract verification checklist
- [x] Mutation endpoints unaffected (read-only cache route; GET-only).
- [x] Frontend types unchanged — the SW layer is transparent to `DiscussionsResponse`.
- [x] Adapter functions unaffected — no API shape change.
- [x] No field silently undefined — no shape change at all.
- [x] i18n keys — no new user-facing strings.
- [x] Real-URL check done against the ACTUAL fetcher call
      (`/conversations?page=&perPage=30`, useConversations.ts:136) — P2-57 lesson applied.
