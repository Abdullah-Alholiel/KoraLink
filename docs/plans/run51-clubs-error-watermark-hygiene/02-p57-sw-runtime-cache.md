# Run #51 — P2-57 SW runtime caching: Gate 0 retro + compact Gates 1-3

(Extends the killed run's plan dir — its two commits 8e859b0/499065f were verified
and promoted this run; this doc covers THIS run's own slice, P2-57.)

## Gate 0 — Retrospective

**Area audit (next.config.mjs runtimeCaching + worker/index.js, last touched runs #18/#23/#43):**
- Run #18 flipped the feed recipe to NetworkFirst; run #43 pinned `[200]` cacheable
  statuses. Both were verified by shape-level tests only (handler names, `source`
  substrings). **Neither run validated that the patterns match REAL request URLs.**
- Root cause of the inert table (found this run, three classes of defect stacked):
  1. **Prefix drift** — patterns match `/api/...`; the API global prefix is
     `api/v1` (apps/api/src/main.ts:118) and the PWA calls the API CROSS-ORIGIN
     (`NEXT_PUBLIC_API_URL=https://…:8443` staging / onrender prod; fetcher builds
     `${apiBase}${path}`). Real URLs: `https://host:8443/api/v1/matches/...`.
  2. **Query intolerance** — workbox RegExpRoute matches the FULL href including
     the query string (verified in the bundled workbox-routing source:
     `regex.exec(url.href)` with cross-origin index-0 requirement). The old
     `(/.*)?$` tail cannot match `?lat=…` — even a v1-fixed `…/matches$` would
     miss every real feed request.
  3. **Phantom path** — the user-profile recipe matched `/api/user(...)`; the real
     path is `/users/me`. Zero requests could ever hit it.
- **Shadowing hazard (found by the new reality test):** workbox is FIRST-match-wins;
  static-assets `CacheFirst` (`\.js$`) was registered before the payments
  NetworkOnly — the Moyasar SDK script (`cdn.moyasar.com/v1/moyasar.js`) would be
  served from cache. The old intent "never cache financial" was silently broken
  by ordering, independent of the prefix bug.
- Tech-debt lesson: **config-as-contract needs behavior tests against reality**
  (real URLs), not shape tests against the config's own text.

**Fix:feat ratio:** recent window is fix-heavy by design (review-driven hardening);
no new reactive loop detected.

## Gate 1 — Product spec (compact)
- **Problem:** offline/weak-network players get the offline banner everywhere; the
  PWA's entire SW data-caching layer never engaged (inert patterns), so even the
  designed offline behaviors (last-good feed/detail, SWR clubs) never existed.
- **User story:** as a player, revisiting a match I saw earlier should render its
  last-good data even if my connection dropped; payment/auth code must NEVER come
  from cache.
- **IN:** corrected patterns (v1 + query-tolerant + scoped), match-detail recipe,
  NetworkOnly-first ordering, users/me pattern, reality test suite.
- **OUT:** offline mutation queue (P2-7, Serwist background-sync backlog), served-
  from-cache UX markers, worker/index.js changes (document fallback already ships).

## Gate 2 — Architecture (compact)
| File | Change |
|---|---|
| apps/player-pwa/next.config.mjs | runtimeCaching rewritten: NetworkOnly trio FIRST (payments incl. moyasar host, auth, wallet) → match-detail (single-segment, NF 1h) → feed (collection only, NF 60s) → static assets (CF 30d) → clubs/venues (SWR 24h, collection+detail) → users/me (NF 5min). All anchored `^https?://[^/]+/api/v1/...` with `(?:\?.*)?$` tails. |
| apps/player-pwa/test/lib/sw-config.test.ts | NEW (rebuilds the killed run's orphaned .mjs which never matched vitest's `.{ts,tsx}` include glob): 12 cases incl. the URL-REALITY suite (real prod URLs → expected recipe; sub-resources match NOTHING; money/auth NetworkOnly at behavior level). |
| apps/player-pwa/test/lib/sw-config.test.mjs | deleted (inert twin). |

No API/DB/i18n surface changes. Observability: no new scope (SW caching has no
app-code surface; failures already degrade to network fetch).

## Gate 3 — Contract checklist
- [x] Mutation returns populated object — N/A (no API change).
- [x] Frontend types accept backend JSON — N/A (no shape change).
- [x] Adapters — N/A.
- [x] No silently-undefined fields — N/A.
- [x] i18n keys both languages — N/A (no UI strings).
- [x] Patterns validated against REAL URLs — YES, behavior-level (12/12).
- [x] Ordering: NetworkOnly recipes precede all cacheable ones — asserted
      implicitly by the money/auth reality cases (they must resolve NetworkOnly).
- [x] Cacheable recipes all pin `[200]` — asserted for every non-NetworkOnly recipe.

**Gate 3 → Gate 4: PROCEED (autonomous mode).**

## Gate 4 — slices
- Slice 1 (tracer): patterns + detail recipe + test file; suite 12/12 green.
- Verification: vitest file-suite 12/12 → full PWA 77f/523t → turbo 3/3 →
  commit e305eb9 (single commit: config + its contract tests + docs).

## Live-behavior note (next run / after deploy)
sw.js is build-generated (gitignored). The new recipes engage on the NEXT staging
deploy; verify in a real browser: DevTools → Application → Cache Storage shows
`match-detail-cache` / `matches-feed-cache` populated after browsing; airplane-mode
revisit of a seen match renders last-good data. Sentry WEB-C/WEB-B (sw.js load
failures on prod Vercel) unaffected — unrelated hosting-CSP class.
