# Run #124 — Program Design (Gates 1–3 compact)

Two items, one cycle doc. Vertical slices per item; every slice ends with gates green.

## Item 1 — P2-180: clubs/[id] route-level error boundary + loading skeleton (USER-VISIBLE)

**Problem.** `clubs/[id]/` is a standalone route OUTSIDE `(main)`. The (main)/layout surface
ErrorBoundary (run #96) never covers it, and the route ships no error.tsx/loading.tsx — a
render-throw deep-link falls to the `[locale]` ROOT boundary and blanks ALL chrome (nav bar
included). match/[id] got exactly this treatment in run #96; club detail is the last hot
standalone route without it.

**User story.** As a player opening a shared club link, when the page render throws, I see a
localized classified error card with Retry INSIDE the app shell (not a blank screen), and while
the club data loads I see a skeleton shaped like the page instead of a white flash.

**Scope.** IN: `clubs/[id]/error.tsx` (RouteError + captureError + errorKey(classifyError)),
`clubs/[id]/loading.tsx` (role=status skeleton, aria-label via common.loading), route-boundaries
structure test pins extended. OUT: in-page fetch-error handling (already shipped, P2-160),
backdrop changes, new i18n keys (routeError.* + common.loading already exist).

**API contract.** None (render-time only; no endpoint changes).

**Gate 3 contract checklist.**
- [x] No endpoint changes → no JSON shapes to pin.
- [x] Reuses `RouteError` component (already captures + classifies; boundary-copy test pins it).
- [x] No new i18n keys → parity stays 1231/1231 (verified after build).
- [x] Structure test extended (loading + error pins) so the boundary cannot silently regress.

## Item 2 — P2-153: hex fold — 4 components off the adapter module (HARDENING, cap=1)

**Problem (re-scoped against live code).** The row's original premise ("components call mapX;
move mapping into hooks") was STALE: the 4 components import PURE domain helpers from
`@/lib/api-adapter` (todayInRiyadh / dateInRiyadh / riyadhISO / parseHostDateParam /
pitchCostForDuration / pricePerPlayer / isPotmVotingOpen). No wire-shape mapping happens in any
component. The real seam violation is module NAMING: pure domain code lives in the adapter, so
components transitively "touch the adapter" and the hex metric counts them.

**Fix shape.** Extract the 7 helpers to `lib/riyadh-time.ts` (dates) + `lib/match-pricing.ts`
(pricing + POTM window). api-adapter re-exports them (back-compat for hooks + the 5 pure-domain
test files that import from the adapter). Repoint the 4 components to the domain modules.
Tighten the hex-audit detector (`from '@/lib/api-adapter'` regex → any api-adapter import) so
the metric reflects the real convention; metric 4→0, baseline updated in the skill.

**Contract pins.** Zero behavior change: helpers move byte-identical (same names, same JSDoc);
test/lib/pricing.test.ts + potm-window.test.ts + riyadhISO.test.ts + host-date-param.test.ts
continue to pass THROUGH THE RE-EXPORT (imports untouched) proving the public surface didn't
drift; vitest full suite re-run.

**Observability.** No new surfaces (structure/hex guards are the tripwires).
