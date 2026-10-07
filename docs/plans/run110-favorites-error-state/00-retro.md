# Run #110 — Gate 0 Retro: favorites ids-error state + heart pending isolation

## Context audit
- P2-161 (venue favorites) merged yesterday (PR #92, fbdb8f2), verified LIVE this run on the
  current API: table + journal current, GETs 200, POST/DELETE `:id/favorite` idempotent (201
  created:true→false; 200 removed:true→false), unknown venue 404 (approval predicate), unauth 401.
  My first probe used wrong paths (`/venues/favorites/:id`) → 404s were MY error, not a regression
  (route shape per controller: `POST/DELETE /venues/:id/favorite`).
- Sentry 24h cluster (4 favorites "Failed query" events, 02:04Z, seed user UUID
  48004590… = run #109's own dev-login probes) = the run-#109 pre-migration probe window
  (report admits E2E ran before migrate; 1M = pre-fix GROUP BY SQL). Zero recurrences in 8h+;
  live API currently serves the feature correctly. NOT user breakage.
- blocks rider verified in source: blocks.service.ts:82 `{ blocked: false, removed: deleted.length > 0 }`.

## DECISIONS.md check (Gate-0 supremacy)
Read kanban/DECISIONS.md first: no entry conflicts with this fix (no Drawer, no bell, no
money/PDPL surface touched). Owner standard "error copy = what happened + why + what next,
localized EN+AR" APPLIES to the new strip — key copy follows it.

## Findings driving this cycle (reviewers A+B, run #110)
1. **P1 (Reviewer B) — favorites ids-query error = false empty**: clubs/page.tsx destructures
   only `data`/`isLoading` from useVenueFavoriteIds(); on error favSet=[] → Favorites pill
   narrows to nothing → "No favorites yet" onboarding copy at a user whose favorites failed to
   load. Same false-empty the loading guard (PR-Agent round-1 fix) was added to prevent.
2. **Minor (A+B) — one shared mutation freezes every heart**: `disabled={favoriteToggle.isPending}`
   on all cards + hero — toggling one heart disables all hearts on screen until settle.
   Fix: per-venue pending via mutation.variables.venueId comparison.
3. Reviewer A hydration flag on admin users/page.tsx Date.now() REFUTED (useLiveAdminData is
   client-fetch gated — rows arrive post-mount; same reasoning as the verified run-#86 refutation).
   Hardcoded `Search` button label CONFIRMED (users/page.tsx:250; common.search exists EN+AR)
   → follow-up row P2-166 (next admin touch), not this cycle.

## Scope
IN: clubs/page.tsx (ids error destructure + fail-open filter + error strip w/ retry),
    [id]/page.tsx + clubs/page.tsx (per-heart pending isolation), i18n clubs.favoritesError EN+AR,
    vitest cases (error strip renders; filter does not narrow on ids error).
OUT: profile favorites entry point (P2 polish — board as follow-up), partner bookings-today
     surface (needs owner placement call — exists as P2-134 class), admin :id param shape
     validation sweep (boarded, repo-wide, separate cycle).

## Slice plan (vertical)
S1: hook-level — destructure isError/refetch in page, fail-open filter, error strip UI, i18n.
S2: per-heart pending isolation (both surfaces).
S3: tests + full gates (turbo --concurrency=1, vitest w/ 'Test Files' grep, type-check) → lane
    branch → PR → triage PR-Agent → squash.
