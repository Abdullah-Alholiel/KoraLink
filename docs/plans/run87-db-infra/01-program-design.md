# Run #87 — Program Design (P2-125 scheduler failure observability)

Gates 1-3 compact per autonomous mode. Lane: zeroshot `01a0edc9` (Opus 5.5 worker,
software-change template, input = {task} with acceptance folded in).

## Problem
`matches.scheduler.ts` carries 4 cron jobs (auto-complete-past-matches */5, finalize-pom-voting
*/5, match-start reminders */15, check-min-players */10). Every catch block logs
`logger.error(...)` only — zero Sentry captures — while `notifications.scheduler.ts` and
`users.scheduler.ts` already capture. Push fan-out rejections in `sendPushToUsers`
(notifications.service.ts:414) log at `debug`. Because reminder ladders are idempotent
(WHERE-guarded) a failing tick re-fires silently every interval; ops sees nothing in Sentry
until users miss reminders. AGENTS.md §4 mandates Sentry/Pino on features.

## User story
As an operator, a failing scheduler tick or push fan-out must appear in Sentry with a scope
tag the moment it happens, so reminders/POTM/auto-complete breakage is alertable instead of
silent.

## Scope
IN: 4 Sentry captures in matches.scheduler.ts catch blocks (tags `{ scope: 'matches.scheduler.auto-complete|pom-finalize|reminders|min-players' }`, logger.error kept); sendPushToUsers rejected-loop → logger.warn + ONE aggregated capture `{ scope: 'notifications.push-fanout' }` per call (first rejection reason); users.scheduler.ts verify-or-add `users.scheduler.purge` scope tag; NEW spec `matches.scheduler-observability.spec.ts` (4 scopes + logger.error retained).
OUT: no cron schedule/service-logic/query changes; no 4xx per-sub captures (429/400 stay debug by design, P2-41 rider); schema/migrations/DTOs untouched; PWA/admin untouched.

## Contract (Gate 3 checklist)
- [x] Touches exactly 3 source files + 1 new spec — no API shape change, no i18n keys (zero user-facing strings), no migration → no contract surface.
- [x] Capture pattern mirrors notifications.scheduler.ts:42 verbatim
      (`Sentry.captureException(err, { tags: { scope: '...' } })`).
- [x] Aggregated fan-out capture fires once per sendPushToUsers call, not per task (Sentry
      noise bound).
- [x] Spec mocks `@sentry/node` captureException; asserts each scope + logger.error retained.
- [x] Observability wiring per AGENTS.md §4 — env-gated by the existing Sentry init
      (no new provider).
- [x] Gates: `npx turbo run build --concurrency=1` 3/3 + api jest green + pwa vitest
      untouched/green — run by the PARENT on the merged tree (lane-internal gates are
      advisory; the factory owns acceptance).

## Gate 4 (slices)
Single slice (observability batch) → lane builds → parent verifies diff scope → real gates on
merged tree → PR flow (bot checks + triage) → squash-merge.
