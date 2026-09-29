# Run #87 — Gate 0 Retrospective (DB & Infra lane, 87%4 = 3)

**Baseline:** staging @ `067f4b8` (run #86 docs tip). PRs #50/#51 merged 2026-09-29 morning.

## Recent-commit pattern
Last 5 substantive commits (post-#85): P2-68 admin CSV export (PR #50), P2-124 admin
hydration batch (PR #51), run-#86 docs. fix:feat ratio healthy — the last 3 code PRs were
review-driven hardening fixes (#50, #51) against a steady feature cadence; no reactive loop.

## Admin state check
`git status --short apps/admin apps/api/src/modules/partner` → clean; admin service active.
No admin items picked this run (DB & Infra lane). No HOLD.

## Service + error posture
- 3/3 services active; `/api/v1/health` 200; journal error scan (5h) clean on all three units.
- **Sentry (24h): zero NEW signatures.** API project silent since 2026-09-25 20:19Z
  (post-Neon-cutover); `KORALINK-API-1C` (old-Neon quota) lastSeen 09-25 15:00Z = cutover-day
  history, NOT recurrence (P1-52 stays DONE). Web project frozen since Sep 14.
- i18n parity: PWA ar=en 1003/1003 leaf keys exact.

## Lane candidates audit (DB & Infra focus)
- **P2-88** (drizzle meta snapshot gap): Reviewer A re-audit this run — journal `when` risk
  **REFUTED** (drizzle migrator iterates journal array order + tracks applied by hash in
  `__drizzle_migrations`, not timestamps; 1ms-apart `when` clusters are batch-edit artifacts).
  Snapshot rebuild remains a dedicated half-cycle on a drizzle-kit machine — not this run.
  Board row updated with the refutation.
- **P2-42 CSP** (2-PR effort): PR path is free right now but the lane is capped at one item;
  higher-value pick below.
- **Reviewer B P1 (run #87): scheduler failure observability** — matches.scheduler.ts has 4
  @Cron jobs with logger.error-only catch blocks (zero Sentry captures) while
  notifications/users schedulers already capture; push fan-out rejections swallowed at debug
  (notifications.service.ts:414). Reminder ladders are idempotent + WHERE-guarded, so a
  failing tick retries quietly forever — invisible until users miss reminders. AGENTS.md §4
  (Sentry/Pino wiring) violation class. → **NEW P2-125, picked as the run's lane item.**

## Reviewer claims verified this run
- Run #86's build claims (P2-68 CSV + P2-124 hydration) independently verified by Reviewer B
  + parent spot-checks: FORMULA_PREFIX guard, state-based layout guard + usePathname,
  local-zone week.ts, PRs #50/#51 state=MERGED, i18n parity, admin tsc. All promoted DONE ✅.
