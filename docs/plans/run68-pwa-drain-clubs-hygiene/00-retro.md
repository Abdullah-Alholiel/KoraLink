# Run #68 — Gate 0 Retrospective (cycle: pwa-drain-clubs-hygiene)

## Baseline
`4b67314` (staging HEAD at preflight; run #67's board commit). Rotation: 68 % 4 = 0 → PWA screens.

## What landed since run #67 (context restore)
- `d4b5ef1` P2-87 push-unsubscribe feedback (IN-REVIEW → verified this run).
- Reviewer sweep of last 5 commits (run #66/#67 slices): clean — see RUNS report.

## State of the PWA polish queue (the "drain" story)
- P2-62 (chat read-dedup leak): fix ALREADY on staging (`useMessages.ts:289-292`
  reset-on-matchId effect, run #51, 499065f) — row already DONE ✅ in BOARD.md
  (an early status-slice misread suggested stale TODO; corrected).
- P2-63: row itself says CLOSED (run #51); verified — ChatSheet :218 + reports :77
  render classifyError copy; OfflineBanner present on all 9 (main) surfaces.
- P2-70: fixed run #56 (locale-dict copy). P2-59: run #50 useNow pattern; only
  residual is profile purgeDate (IIFE at page.tsx:708) — dialog is closed at
  SSR/hydration, so the value is never rendered pre-mount; accepted minor, no fix.
- P2-79: DONE (run #66 residual + run #67 verify).

## Reviewer findings triage (runs #68 Reviewers A+B, glm-5.3-flash)
- Reviewer A: 0 CRITICAL / 0 IMPORTANT. 8 standing bug classes clean.
- Reviewer B: P2-87 claims PASS (all sub-claims + 6/6 vitest). Product gaps:
  1. profile balance shows 0 SAR on fetch error → **REFUTED by code**:
     P0-6 run #29 (`profile/page.tsx:159-169`) renders "—" + localized error line.
  2. chat send has no per-message retry → **REFUTED by code**:
     `ChatSheet.tsx:306-310` failed-bubble tap-to-retry exists (ACK-timeout +
     onError flip status, retry reuses client_message_id).
  3. clubs empty state conflates "no venues at all" with "filtered to nothing" →
     CONFIRMED PARTIAL: heading splits (`common.noResults` vs `clubs.noClubs`)
     but the zero-venues case shows the wrong advice; → built this run.
  4. purgeDate bare `new Date()` → accepted minor (no hydration exposure).

## Cross-checked with board state (same audit pass)
- P2-13 residual: clubs "Nearby" pill is the DEFAULT ACTIVE filter yet applies no
  ordering (no-op), "Top Rated" pill `return true` unconditional (no-op, rating
  column is all-zero — no write path exists). Both are dead UI per the dead-UI
  rule → re-scoped into this cycle (see 01-program-design.md).
- Tech-debt ratios: last ~30 commits overwhelmingly fix-class but each tied to a
  verified board item; no reactive loop signal.

## ADMIN STATE CHECK
Not an admin cycle. Projects-dir feature lane remains mid-merge conflict (UU ×4 +
staged edits) — untouched; P2-89/P2-12 stay ADMIN HOLD. Staging worktree clean
except foreign `.local/` (never staged).

## Recommendation
Proceed to Gate 1: tiny drain slice on clubs page + board hygiene. No schema,
no API, no i18n structure change beyond 2 new leaf keys (parity-safe).
