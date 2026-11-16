# Run #121 — Gate 0 Retrospective (API lane, 121 % 4 = 1)

**Scope audited:** matches.service.ts (P2-174 site), partner.service.ts getEarnings/getDashboard,
recent commits `01378c3` (P1-64 recurring), `60dfc21` (P1-63 SLA sweep), `7d04568` (P2-173).

## Facts
- fix:feat ratio healthy — last 10 commits: 1 fix / 4 feat / 5 docs. No reactive-fix loop.
- **DECISIONS.md consulted (Gate-0 supremacy):** no row contradicts this run's picks.
  P1-65 touches the partner earnings surface (data + admin console): clean tree verified
  (no admin hold). Recurring-series identity (Reviewer B P0-candidate) is NOT boarded as
  buildable — it is a product-shape decision surfaced to Abdullah in the report.
- Run #120 claims verified BEFORE picking (claims ≠ facts): both PRs (#108, #109) promoted
  DONE — recurring spec 12/12, matches 32s/238t, structure tests 12/12 (parent-verified;
  Reviewer B independently confirmed all 9 sub-claims with file:line).
- Hex lane: DRIFT on 2 metrics (api_exc_total 254→265, api_raw_sql 55→57) — growth from
  P1-63/P1-64 feature code, Reviewer A hex check found NO boundary violations → boarded as
  P2-176 (accept-growth note), not a revert driver.
- Sentry triage: venue_favorites cluster = single 17s burst Oct 7 02:04Z (deploy-before-
  migrate window pattern, P2-51's standing cost), current code already carries the GROUP BY
  fix → no new board action. API-1C = old Neon project history. No new error clusters.

## Findings mapped to this cycle
| Finding | Source | Action |
|---|---|---|
| Single-path createMatch lacks cross-pitch guard | Reviewer A CRITICAL (confirms P2-174) | BUILT this run |
| getEarnings contract pitfalls (empty-shape, SQL-side agg, money typing) | Reviewer A IMPORTANT | Baked into P1-65 lane task (all 4 pre-empted in the task spec) |
| Recurring matches lack series identity | Reviewer B P0-candidate | Owner product decision — surfaced in report, not built |
| HostMatchForm offline state missing | Reviewer B | Boarded P2-177 (PWA lane candidate) |

## Verdict
Proceed to Gate 1-3 for P2-174 + P1-65 (compact single doc). No retro blockers.
