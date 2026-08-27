# Gate 0 — Retrospective (Run #3, cycle `partner-portal-admin-scope`)

**Baseline commit:** `f0b0fe3` (origin/main HEAD after run #2). Tree clean, `main`, no lock.
**Date:** 2026-08-27T03:35Z · Mode: autonomous (cron run).

## Context restored

- Run #2 built P0-3 (env-secret hardening, `42d2d86`) and re-verified P1-1/P1-4/P1-5 DONE.
- `in_review_items` empty; no previous claims outstanding.
- Since run #2: only `8071773` (board) + `f0b0fe3` (graphify refresh) — no code drift.

## Health snapshot

- `koralink-api` / `koralink-pwa` / `koralink-admin` all **active**; `/api/v1/health` **200**;
  0 journal errors in 5h window. No P0 service item.

## Reviewer findings (deepseek-v4-pro, `deleg_7c3b893b`, 250s) — merged with self-review

### CRITICAL (→ board, NOT built this run)
- **Settlement double-payout race (P2-9)**: `generatePending` NOT-EXISTS+insert not in tx, no
  `unique(venue_id, period_start)` (admin/settlements.service.ts:99-146); `settlement.pay()`
  TOCTOU reads status then updates with no `WHERE status='pending'` (:65-92). Bookkeeping-only
  (no real money movement) + admin-triggered → kept at P2-9, fix plan recorded for next run.

### IMPORTANT (→ two built this run; rest → board)
- **P1-6 CONFIRMED** — `updatePitch` (partner.service.ts:317) owner-scoped, no actorRole, unlike
  `deletePitch` (:352) which uses `assertPitchAccess`; `getDashboard` (:149) / `getEarnings`
  (:374) always `ownedVenueIds`-scoped → Admin opening `/partner` sees empty dashboard/earnings
  while `/partner/venues`+`/pitches` list all. **→ built this run.**
- **markNoShow 500 CONFIRMED** — matches.service.ts:1414 dereferences `player.no_show` BEFORE
  the `if (!player)` null guard (:1416) → `TypeError` 500 instead of `NotFoundException` 404
  when the target user isn't in the roster. **→ built this run.**
- Mutation-return contract violations (board P2-5, expanded): `castVote` → `{message}`
  (matches.service.ts:1752), `createDispute` → bare row (:1585/:1606), `createVenue` → partial
  `{id,name,city}` (partner.service.ts:91), `deletePitch`/`deleteSlot` → `{deleted:true}`
  (:369/:630), `createSlot` → bare row (:604).
- `notifications.service.ts:189-196` POTM push omits locale (P2-8 confirmed); match-start
  reminder title/body hardcoded English (matches.service.ts:255-260) — locale plumbing (P1-5)
  works but the text itself isn't localized.
- Zustand persists server cache (`balance`, `paymentMethods`, `bookedMatchIds`,
  store/useAppStore.ts:90-99).

### MINOR (board/backlog)
- WS `leave-conversation` no participant check (app.gateway.ts:345-351) → P2-6 confirmed.
- `app.gateway.ts:109` `JWT_SECRET` fallback `'fallback-dev-secret'` survives bootstrap hardening.
- `GetMatchesDto.format`/`gender` typed `string` not union (get-matches.dto.ts:55,64).
- conversations `LIMIT 50` no pagination; `listMessages` OFFSET not keyset.

### Previous-run verification (claims ≠ facts)
- P0-3 (bootstrap-secrets + main.ts call) **CONFIRMED**; P1-4 (7 hot-FK indexes) **CONFIRMED**;
  P1-5 (worker/index.js:20 `data.locale || 'en'`) **CONFIRMED**; P1-1 (3 @Cron jobs)
  **CONFIRMED**. No discrepancies.

## fix:feat ratio & decision

Recent history is feature-heavy (scheduler, indexes, push locale, env hardening) with the fix
work localized to review-driven edge cases. **Decision:** build P1-6 (board's stated next
priority, backend-only, self-contained) as the primary vertical slice, plus the trivially-small
markNoShow 500 fix (broken user flow) as a second slice. Defer settlement race (P2-9) to a
dedicated run — it needs a unique-index migration and is admin bookkeeping-only.
