# Run #123 — Cycle: partner earnings CSV export (P2-178) + disputes list/count tx race

## Gate 0 — Retrospective (00-retro.md)

**Baseline:** f87771b (run #122 squash) → HEAD 2e2ca22 (board commit).
**Commit pattern (last 10):** 5 feat / 3 docs / 1 fix / 1 feat(pwa) — fix:feat ratio healthy (<0.5), no reactive loop.

**DECISIONS.md consulted (Gate-0 supremacy):** read in full. No planned change touches a
ledger standard (Drawer RIGHT, DataTable roles, bell placement, EN+AR marketing, defaults+veto).
The earnings export ADDS a button to the PageHeader actions area — consistent with the 7 HQ
export pages' pattern; no Drawer/table-role change.

**Admin state check (run 2026-10-11T15:16Z):** `git status` on apps/admin +
apps/api/src/modules/partner + admin → CLEAN; admin service active; 13 (dashboard) routes
enumerated (audit/dashboard/disputes/matches/partner/pitches/reports/settings/settlements/
transactions/users/venues + layout). **No ADMIN HOLD.** P2-178 written against live code
(earnings page exists at (dashboard)/partner/earnings/page.tsx).

**Tech debt observed in the touch area:**
1. Reviewer B (run #123): disputes list() runs page + COUNT as two statements outside one
   tx → total can disagree with the page under a concurrent SLA sweep write (race, low
   probability, admin-only surface). → parent build item this run.
2. Reviewer A (run #123): sla-list.spec.ts:97 `appealTiebreak` is computed but never
   asserted (dead variable, weakens the pin). → tidy in the same PR.
3. No documented money-path isolation/lock-order convention + no composite index for the
   SLA sweep/list predicate → NEW board row P2-179 (build later, DB&Infra lane).

**Full-stack connectivity:** export path is client-side only (page already holds the full
datasets from GET /partner/earnings — no new endpoint, no new SQL). The tx fix touches
service-internal reads; no contract change (same JSON shape out).

**Gate-0 verdict:** proceed to Gate 1.
