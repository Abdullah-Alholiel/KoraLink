# Run #30 — PDPL Hard-Purge + Restore-Auth Fix

**Cycle:** run-30
**Date:** 2026-09-03 (UTC)
**Mode:** autonomous (cron)

---

## Gate 0 — Retrospective

### What landed since run #29

Run #29 (2026-09-03 10:19Z) shipped P0-6 PDPL soft-delete + export + restore (2 commits:
8ef3106 API slice 1, a17755a PWA slice 2). Reviewer findings (run #30, see Phase 2 in
`kanban/RUNS/2026-09-03T15-19Z.md`):

**Two CRITICAL defects on the run #29 slice:**

1. **C1 — Restore flow is unreachable from the happy path.** After DELETE `/users/me`,
   `profile/page.tsx:653-654` calls `logout()` + `clearAuthToken()` and navigates to `/login`.
   The restore_token is persisted to localStorage (`useUser.ts:215` → `koralink_pdpl_restore_token`)
   but `useRestoreAccount` (`useUser.ts:236`) calls `fetcher('/users/me/restore', { method: 'POST' })`
   which uses the cleared `koralink_token` Bearer. The strategy rejects deleted users with 401, so
   the restore fails. `RestoreAccountBanner.tsx:23-26` documents that it should work "even if Zustand
   thinks the user is unauthenticated" — it does not. **The 30-day grace UX that ships today is
   fiction for the very user it targets.**

2. **C2 — Hard-purge scheduler is referenced but never implemented.** Migration 0031 header
   (`apps/api/drizzle/0031_pdpl_soft_delete.sql:30-44`), schema comments (`schema.ts:481`),
   and service comments (`users.service.ts:15-16`) all describe a 5h cron that anonymizes the
   user row past the 30-day window. Only `matches.scheduler.ts` exists. Result: the
   `purge_at` column is set but never consumed; transactions FK is now RESTRICT so a naive
   `DELETE FROM users` would fail; PDPL erasure obligation is unfulfilled; a deleted user past
   their grace window is bricked (cannot auth, cannot restore, cannot receive OTP).

### Two IMPORTANT defects

- **I1** — `purpose: 'restore'` JWT acts as a full session token on every guarded route
  (`jwt-cookie.strategy.ts:90-98`). Leaked restore_token = 31-day session.
- **I2** — `getPublicProfile` doesn't filter `deleted_at IS NULL` (`users.service.ts:411-427`).
  Public profile leak for soft-deleted users for the full 30 days.

### MINOR

- M1: docstring says `GoneException`, code throws `BadRequestException` (line 587 vs 614).
- M2: Restore banner shows "0 days" after grace expiry; no localized "window expired" state.
- M3: export queries have no `LIMIT` (8 unbounded queries).
- M4: idempotent re-DELETE re-mints a fresh 31-day restore token on every call.
- M5: 0031 SQL comment vs service comment on push_subscriptions CASCADE behavior.

### Decision

**This run ships TWO items:**
1. **P0-C1 — Restore-flow auth fix** (CRITICAL — without this, run #29's grace UX is dead)
2. **P0-6 sub-cycle — Hard-purge cron** (was the run plan; unblocks C2)

**NOT this run** (boarded for #31):
- I1: restore-purpose JWT route-scope (small hardening, requires guard+strategy change)
- I2: public-profile deleted_at filter (1-line filter + spec)
- M1-M5: 410-vs-400 / expired UX / export LIMIT / token re-mint / comment drift (polish)
- P1-ADMIN: admin "deleted users" back-office view (was approved for this run but descoped to
  keep the slice tight; build in #31 alongside I1 + I2 — those are also P0-6 related)

### Standing bug-class sweep (PDPL surfaces): clean

Per Reviewer A: no `eq(col, null)` misuse, no `::uuid` casts, no console.log in users/auth
services, i18n en/ar parity verified (0 key drift, `restoreAccount.*` present in both), sheets
reuse shared `BottomSheet` (no rogue z-index), no dead UI found, delete sheet uses
`Intl.DateTimeFormat` safely server-guarded.

### ZAI delegation note

Zai GLM-5.3-flash API was healthy this run (direct probe 200 OK in 2.8s) but the credential
pool routed the delegation children with HTTP 401 "token expired or incorrect". Confirmed the
direct ZAI key is valid; the pool `last_status: ok` is misleading. Fell back to OpenCode Go
on `https://opencode.ai/zen/go/v1/chat/completions` with `glm-5.3-flash` — returned in 313s +
137s = 7m 30s for both reviewers (25 + 10 tool calls). Documented for next run.

### ADMIN HOLD

Apps/admin tree was clean (no dirty files in apps/admin or partner modules). No hold needed.