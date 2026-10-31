# Run #137 Cycle — Gate 0 Retrospective

**Date:** 2026-10-16 ~10:20–11:00Z · **Lane:** API modules (137 % 4 = 1)
**Items:** P2-110 CORS log demotion (primary) · PR-queue repair (#137/#138 docs conflicts)

## DECISIONS.md check (owner-standards doctrine)
Read FIRST. No CORS/logging standard in the ledger; the 2026-10-04 default+48h-veto adoption
is the only relevant procedure. No design/UX change this cycle contradicts the ledger.

## Area audit (CORS deny path, main.ts)
- `apps/api/src/main.ts:125` throws `HttpException('CORS origin not allowed: <origin>', 403)`
  on deny. Comment block (main.ts:112-121) documents the P2-201 invariant: the deny MUST stay
  a thrown error — `callback(null, false)` lets the request execute routes (side effects!)
  while only the browser hides the response. **This invariant is preserved by this cycle.**
- Sentry triage (24h): `KORALINK-API-B` "CORS origin not allowed: https://attacker.example"
  = 130 events, culprit `GET /api/v1/health`, latest 2026-10-13. All other API issues are old
  (Oct 7 deploy-before-migrate window / Sep 24-25 pre-Neon era) — no NEW error signatures.
- **Root cause (proven, not guessed):** AllExceptionsFilter only captures ≥500 to Sentry
  (apps/api/src/common/filters/all-exceptions.filter.ts:50-63) and its spec pins 403 as
  noise-filtered. Yet the 403 CORS events ARE in Sentry. Latest event's stack:
  express router → cors/lib/index.js `optionsCallback` → `origin` callback in
  `apps/api/dist/src/main.js`, `mechanism: {type: generic, handled: true}` — Sentry's express
  middleware instrumentation auto-captures exceptions flowing through middleware,
  BYPASSING the filter's ≥500 rule. Board row P2-110's original guess ("demote the log to
  warn") would NOT have fixed the Sentry side.
- fix:feat ratio healthy: last 12 commits on staging are run #136 docs + gates; no fix loop.

## Tech debt observed (not built this run)
- Reviewer A MINOR trio: origin-allowlist parsing duplicated 3× (main.ts:35-44,
  app.gateway.ts:111-145, ws-origin.ts:23-39) — folds into the open P2-205 row; not new drift.
- P2-205 sibling edit (ws-origin.ts DEFAULT_WS_ORIGINS) VANISHED from the shared tree without
  a commit (file unchanged since 19fe073, tree clean) — row stays open; sibling work lost.
- PWA sentry noise `viewport-diagnostic:standalone` (55/24h) = deliberate diagnostic in
  ViewportHeightSync.tsx:53 — MINOR, no action.

## Verdict
Proceed to Gate 1-3 for P2-110 with the classification design (see 01-program-design.md).
