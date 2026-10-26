# Run #167 — P2-47(b) restore-on-behalf — Gates 1–3 (compact)

## Gate 1 — Product spec
**Problem:** a player soft-deletes their account (PDPL, 30-day grace). If they change their mind AFTER losing the device/restore token — or a support admin needs to un-delete on their behalf — there is NO admin path. The ops table shows the ghost with a purge countdown but zero actions.
**User story (P0 for support ops):** as an admin, on a soft-deleted account still inside the grace window, I can click "Restore account" → the deletion is cancelled (`deleted_at` NULL), the scheduled purge never fires, and the account is immediately usable again.
**Out of scope:** restoring HARD-PURGED ghosts (PII already erased — irreversible by design, 409); bulk restore (PDPL doctrine: "Purge/restore/delete are NEVER bulk", users.service.ts:390); email restoration (PII already nulled by soft-delete; account recovers with phone only — same as the player self-restore path).
**Success criteria:** restore button visible ONLY on soft-deleted grace-window rows; API refuses on: living accounts (400), already-restored (409), hard-purged (409); every restore audited; admin i18n EN+AR parity; gates green.

## Gate 2 — Architecture
Data flow: drawer action → `PATCH /admin/users/:id/restore` (new controller route, Admin guard inherited from controller class) → service tx:
1. lock target row `FOR UPDATE`,
2. re-read `deleted_at` (race-safe: a concurrent purge or self-restore flips state after the drawer snapshot),
3. soft-deleted & inside grace → `UPDATE users SET deleted_at = NULL (updated_at now())`,
4. audit `user.restore` (before/after) via AuditService INSIDE tx,
5. broadcastOps('users') AFTER commit.
No schema/migration change. No frontend API-shape change (action posts, drawer re-reads list).

## Gate 3 — Program design (contract)
**Endpoint:** `PATCH /api/v1/admin/users/:id/restore` → `200 { message: string }` (fire-and-forget drawer re-read; no populated payload needed).
**Errors:** 404 unknown id · 400 `{ message: 'Account is not deleted.' }` (living account) · 409 `{ message: 'Account was already restored.' }` (deleted_at nulled between snapshot and call) · 409 `{ message: 'Account was hard-purged; restoration is not possible.' }` (phone LIKE 'purged-%').
**Service signature:** `async restoreByAdmin(id: string, adminId: string, ip?: string): Promise<{ message: string }>`
**Race discipline:** status check + write + audit in ONE tx holding the row lock — the double-click loser hits the 409 already-restored branch, never double-writes (flag-reset dedup lesson: idempotency on the mutable state + row lock, not history).
**TS frontend:** `api.patch(`/admin/users/${id}/restore`)` inside `act()`-style flow with ConfirmDialog; visible when `purgeInfo(u)` reports scheduled (grace window) — hidden for `purged` ghosts.
**i18n keys (hq ns, EN+AR):** `restoreAction`, `restoreConfirmTitle`, `restoreConfirmMessage`, `restoreSuccess`, `restoreFailed` (+ audit page reuses existing keys).
**Gate 3 checklist:**
- [✓] Mutation returns an explicit shape (`{ message }` — read-modify via list re-read; no relations needed on a single-flag flip)
- [✓] No frontend type drift (no new Api types; drawer re-reads the table)
- [✓] Adapter: none needed (no new wire shape consumed)
- [✓] No silent undefined (drawer renders from refreshed list state)
- [✓] i18n keys ×2 locales (written this slice)

## Slices
- S1: DTO-free controller route + service method + 5 specs (living-400, restored-409, purged-409, happy-path predicate, audit-called) → jest + build green.
- S2: admin drawer restore button (grace-window gated) + ConfirmDialog + success/error copy + 5 i18n keys EN+AR → turbo build + tsc green.
