# PWA offline URL restore — Cycle Retrospective (Gate 0)

Run #64 · 2026-09-20 · PWA lane (64%4=0) · staging @ 49bd78c

## Area audit (what this cycle touches)

The offline/service-worker layer, current state:

- `apps/player-pwa/worker/index.js` (source, PREPENDED into generated sw.js by next-pwa —
  committed sw.js tail confirms `importScripts("/fallback-*.js","/worker-*.js")` runs BEFORE
  `precacheAndRoute`/`registerRoute`, so the worker's own fetch listener wins for locale
  document navigations).
- Worker intercepts `/en|/ar/*` same-origin GET document navigations: network-first, on failure
  serves the locale-matching offline page from cache `koralink-offline-pages`
  (warm-loaded at install). **The address bar keeps the original URL (respondWith), but the
  offline page offers no way back to it** — user must know/retyping the link. = P2-73.
- `public/sw.js` workbox fallbacks (`handlerDidError → self.fallback(document='/ar/offline')`)
  cover only registered routes + start-url `/` (no locale segment → worker skips it).
- Offline page `src/app/[locale]/offline/page.tsx` (P2-70-clean: common.* i18n, reload retry).
- Offline WRITE path still out of scope: P2-7/P2-46 (owner-parked, background-sync outbox).

## Recent commits in the area

- `1f0579d` P2-72 push locale default ar (worker/index.js)
- P2-40/P2-23: locale-aware navigate fallback (the handler above)
- `5bf1766` stale-SW repair login/data flow (historical)

## Tech debt / findings carried

1. **P2-73 (this cycle's item)** — offline deep link lost: no UI path back to the failed URL.
2. **P2-80** — non-precached auth-group routes offline → workbox start-url fallback `/ar/offline`
   (generic, URL lost). NOTE found this run: when the worker IS active, its locale-document
   handler already covers ALL /en|/ar document navigations offline (route-table agnostic);
   P2-80's residual window = stale SW (pre-worker builds) or cache-install miss + workbox-only
   path. Small hardening rides along in the same catch branch this cycle.
3. Reviewer A P3 (not boarded, noted): `::text` vs `::uuid` casts in follows/activities raw SQL
   (index efficiency); offline-page install cache has no re-population path; fetcher has no
   offline-aware error classification.
4. Reviewer B P0-lead "no offline mutation queue" → DEDUPED into existing P2-7/P2-46
   (owner-parked 2026-09-03). Waitlist-promotion push lead → REFUTED (`waitlist_promoted`
   category wired at notifications.service.ts:37, fired in waitlist.service.ts notifyPromotion
   :330-341).

## Retro metrics

fix:feat ratio in last 15 staging commits ≈ balanced (docs/kanban churn excluded); no reactive
fix loop. No contract breaks in the area (no API changes this cycle).

## Gate 0 verdict

PROCEED to Gate 1 with P2-73 (+P2-80 hardening) as the cycle item.
