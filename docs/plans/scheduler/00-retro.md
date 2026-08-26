# Gate 0 — Retrospective: P1-1 Scheduler (reminders + POTM finalize + periodic auto-complete)

**Date:** 2026-08-26 · **Owner:** parent session · **Source:** run #1 board P1-1

## Problem
Nothing time-based fires automatically except at API boot:
- `autoCompletePastMatches()` runs ONLY on `OnModuleInit` (matches.module.ts:20) — matches
  that end between restarts stay `Open/Full/InProgress` in the DB until the next restart
  (virtual status masks it at query time, but DB rows are stale — indexed queries, admin
  views, and notifications see wrong state).
- POTM voting window (`VOTING_WINDOW_HOURS` after `effectiveCompletedAt`) is only computed
  **lazily** on `GET /matches/:id/pom-result` — there is no job to finalize/announce the
  winner or close voting.
- No match reminders exist at all (web-push path `sendPushToUsers` is ready but nothing
  calls it on a schedule).

## Current architecture (verified)
- `MatchesService.autoCompletePastMatches()` — bulk UPDATE, exists, runs at boot only.
- `MatchesService.effectiveCompletedAt()` / `resolveEffectiveStatus()` — query-time virtual
  status (handles the gap read-side).
- `getPomResult(matchId, userId)` — lazy compute, no job.
- `NotificationsService.sendPushToUsers(userIds, payload)` — ready; used for POTM decided
  push (line ~170) and admin notifications.
- `@nestjs/schedule` NOT installed. NestJS v10+ supports `@Cron`/`@Interval` with
  `ScheduleModule.forRoot()`.

## Design decision
Add `@nestjs/schedule` (NestJS-native cron, no external infra):
1. **`@Cron` every 5 minutes → `autoCompletePastMatches()`** — closes the restart gap
   permanently. Idempotent (WHERE status IN open states + past end). Log count when > 0.
2. **`@Cron` every 5 minutes → `finalizePomVoting()`** — find Completed matches where
   `pom_winner_id IS NULL AND pom_announced_at IS NULL AND effectiveCompletedAt +
   VOTING_WINDOW_HOURS < NOW()`; count votes per match, set winner (highest count; tie →
   earliest vote), set `pom_announced_at = NOW()`, push "POTM decided" to all attendees.
3. **`@Cron` every 15 minutes → `sendMatchStartReminders()`** — find matches starting in
   [15m, 45m) with status Open/Full, push reminder to confirmed players (dedup via
   `reminders_sent_at`-style guard — use `matches.reminders_sent_at` column? see below).

## Schema change needed
Add `matches.reminders_sent_at timestamp null` (guard so reminders fire once per match).
Migration 0017. POTM finalize uses existing `pom_winner_id/pom_announced_at` columns — no new
columns needed there (idempotency via those NULL guards).

## Files touched
| File | Change |
|---|---|
| `apps/api/package.json` | + `@nestjs/schedule` |
| `apps/api/src/app.module.ts` | `ScheduleModule.forRoot()` |
| `apps/api/src/modules/matches/matches.scheduler.ts` (new) | 3 cron jobs calling service methods |
| `apps/api/src/modules/matches/matches.service.ts` | expose `finalizePomVoting()`, `sendMatchStartReminders()`; reuse existing methods |
| `apps/api/src/database/schema.ts` | `matches.reminders_sent_at` column |
| `apps/api/src/modules/notifications/notifications.service.ts` | reuse `sendPushToUsers` (no change expected) |
| Gate docs: this + `01-program-design.md` | |

## Risks
- Cron jobs must be idempotent (restarts, overlapping ticks) — all three guarded by WHERE
  conditions, not by in-memory state.
- 5-min cadence + `@Cron('*/5 * * * *')` — NestJS cron uses seconds-spec; `*/5 * * * *`
  means every 5 min at :00/:05/…. Fine.
- Tie-breaking for POTM: earliest-created vote wins. Document in program design.
