# Run #186 — Gate 0 Retrospective (Admin-lane cycle, 186%4=2)

**Date:** 2026-11-04 · **Base:** staging `33912f4` (== origin/staging) · **Reviewer model:** glm-5.3-flash (zai probe 200)

## DECISIONS.md read (Gate 0 first step — owner ledger)
Relevant standing standards: admin Drawer RIGHT both locales (untouched this cycle); EN+AR always
(new i18n keys land in BOTH locales same commit); audit trail = append-only records. No entry
contradicts this cycle's picks.

## Admin state check (Phase 3.5 step-0, MANDATORY — Admin lane)
- `git status --short apps/admin apps/api/src/modules/partner apps/api/src/modules/admin*` → **clean** (no owner WIP; HOLD not triggered).
- `git log --oneline -12 -- apps/admin` → latest `8391831` (P2-291 review moderation, run #182). No drift since items were written.
- `koralink-admin.service` → active. Dashboard routes present: audit, dashboard, disputes, matches, partner, pitches, reports, reviews, settings, settlements, transactions, users, venues.
- Conclusion: Admin lane OPEN. Both picks (P2-292 lift, P1-74 review subject) build against live state.

## Fix:feat ratio (last 15 commits)
2 fix / 6 feat / 7 docs / 1 chore-release → ratio ≈ 0.33 — healthy, no reactive loop.

## Recent-commit tech-debt scan
- PR #211 (33bea28) landed receipt + throttles + WS guard — Reviewer B #186 re-verified all claims live (404 owner-gate, throttle, chunk i18n, WS id-shape) → CONFIRMED.
- Reviewer A #186: hex lane ALL metrics at baseline (39/339/26/33/66) — no import-arrow violations; standing bug classes swept clean (::text everywhere, escapeLikePattern on all ILIKE sites, no console.*, mutations return populated re-reads, i18n parity 814=814 admin / 1183=1183 PWA).

## Findings this cycle (evidence-cited)
| Sev | Finding | Source |
|---|---|---|
| IMPORTANT | `admin/transactions.controller.ts:31` POST :id/refund money mutation has no @Throttle (P2-295 posture applied unevenly) | Reviewer A #186 |
| IMPORTANT | P2-292: audit.controller.ts builds raw SQL + JOINs in the controller (lines 31-45) — the only admin controller doing its own persistence | Reviewer A #181/#186 |
| IMPORTANT | audit.controller.ts:37 `INNER JOIN users` silently drops audit rows whose admin was hard-purged (PDPL) — shrinks the immutable trail | Reviewer A #186 |
| PRODUCT GAP | P1-74: venue reviews not reportable (create-report.dto.ts:4 subject types user/match/venue/message only); offensive reviews rely on admin triage alone | Reviewer B #183 (board) |
| MINOR | audit adminId/entityType filters bare @IsString (silent empty results on malformed ids) | Reviewer A #186 |
| MINOR | host/page.tsx thin UX-state coverage (2 markers vs 13-18 siblings) | Reviewer B #186 — boarded P2-307, not built this run |

## Sentry / error-log triage (Phase 1.6)
- journalctl 5h: **zero** err entries across api/pwa/admin. Health 200 (loopback :3001).
- Sentry API: all `Failed query` signatures (push_subscriptions delete, venue_favorites
  insert/select/delete, generic 1M) **lastSeen 2026-10-31T20:00Z** = the final bucket of the
  Neon 1C quota storm (P1-52, resolved run #183). Quota casualties, not live bugs — MINOR/noise,
  no new board rows. CORS probe noise (130) = P2-110 handled. viewport-diagnostic (web, 56) =
  known diagnostic telemetry.
- Strix: `strix_scan=2026-11-03 findings=6` already in STATE notes → **not due this run**.

## Map → user stories
- INNER JOIN hole → "as compliance, every moderation action stays auditable even after the actor is purged" (PDPL trust).
- P2-292 → "as maintainer, every admin controller delegates persistence to a service seam" (consistency; future admin endpoints copy the pattern).
- P1-74 → "as a player, I can report an abusive review like every other subject" (moderation parity; feeds the existing admin queue).

## Verdict → Gate 1
Proceed. Pick order: (1) **P2-292 audit lift + LEFT JOIN** (hardening, Admin lane, reviewer-IMPORTANT), (2) **P1-74 review subject type** (user-visible, PWA+API). Both vertical-slice sized, no owner call, no schema/migration (reports.status/audit_logs unchanged; COALESCE label only).
