# Run #40 — Gate 0 Retrospective (compact, autonomous mode)

**Cycle:** P2-52 PWA a11y/design-lens batch + Reviewer-A run-#40 findings (rotation 0 = PWA screens).
**Baseline:** 7a989af (run #39 board commit).

## Audit of the areas touched

- Run #39 left 3 in-review items; Reviewer B + parent independently re-proved all 3
  (contract specs 10/10 jest, journal 37 entries, GiST live + planner-rational seq scan at 5 rows).
- Reviewer A clean sweep: no `::uuid` casts, no `eq(col,null)`, FOR UPDATE on money/roster txs,
  z-index lineage conform, i18n parity exact — the standing bug classes stay closed.
- Standing hydration debt resurfaced as Reviewer-A CRITICAL: render-path `Date.now()` in
  MatchCard.tsx:35 + my-games/page.tsx:18 (the run #34 backlog note predicted this class).
- Offline banner drift is real and measurable: 7 copies, two idioms (`mx-4` vs `mx-5`,
  `py-3` vs `py-2.5`), two i18n namespaces (`common.` vs page default) — exactly the drift
  risk P2-52 flagged.
- fix:feat ratio of the last 15 commits: all fixes/docs/tests, no new features — the loop is
  in hardening mode, which matches the pre-launch posture.

## Findings → classification

| Finding | Class | Action |
| --- | --- | --- |
| Render-path `Date.now()` POTM window (MatchCard, my-games) | CRITICAL | Fixed (257514e) |
| NotificationSheet optimistic badge, no rollback; unread from page 1 only | IMPORTANT | Fixed (257514e) |
| RescheduleSheet 30-day window vs P1-13 7-day spec | IMPORTANT | Fixed (3da181e) |
| IDB versionchange hygiene; null-actor crash; DatePicker midnight freeze | MINOR | Fixed (10bb2ae) |
| Moyasar `pk_placeholder` default in env.mjs | P0-2 rider | Folded into P0-2 (unused env) |
| OTP verify brute-force | Refuted | OTP_FAIL_LIMIT=5 exists (otp-store.service.ts:10,89) |

## Decision record

- Reviewer B's OTP P0 was refuted with code evidence; not boarded.
- Moyasar placeholder folded into P0-2 rather than a new row (same owner decision).
- P2-51 urgency DOWNGRADED: Sentry API-11 lastSeen is Sep 6 00:00Z — run #38's
  "recurrence" note was a timestamp misread (its session clock ran fast). Run #36's demo
  hotfix held through the Sep 7 purge window. Owner decision still required before any
  schema-bearing migration ships to the demo.
- Build item chosen: P2-52 batch (rotation 0 + design lens) — startable and finishable
  in budget, no owner dependency, directly consumes this run's reviewer findings.
