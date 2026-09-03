# P0-6 PDPL — Cycle 00 Retrospective (Run #29, 2026-09-03)

## Cycle focus
- **Item:** P0-6 (board row 27) — No account-delete or data-export. KSA PDPL requires both.
- **Owner decision (2026-09-02):** Soft delete (deactivate+hide instantly, purge after 30 days) + JSON export of 7 data groups. "Keep that, it's important."
- **Next-run recommendation from #28:** "P0-6 PDPL delete + export (full cycle, ~2.5h)"

## Gate 0 audit — what already exists

### Schema (apps/api/src/database/schema.ts)
- `users` table (L201-253): has `id, phone, full_name, handle, avatar_url, role, banned_at, suspended_until, verification_status, created_at, updated_at` — **no `deleted_at` column**
- `transactions` (L462+): FK `user_id references users(id) onDelete: 'cascade'`
- `push_subscriptions` (L641-663): FK `user_id references users(id) onDelete: 'cascade'`
- `activities` (L771+): `actor_id references users(id) onDelete: 'cascade'`

### Auth gates (apps/api/src/common/strategies/jwt-cookie.strategy.ts:71)
- Validates only `banned_at IS NULL` — a soft-deleted user would still pass JWT validation unless we add `deleted_at IS NULL`

### Service surface (apps/api/src/modules/users/users.service.ts)
- `getById`, `getProfile`, `getMe`, `getPomCount`, `getMyDiscussions`, `updateMe`, `updatePushPreferences`, `getPushPreferences`, `getPublicProfile`, `searchUsers`
- **No soft-delete, no `markDeleted`, no export, no `isDeleted`/`deletedAt` field**
- `updateMe` uses bare `.returning()` on the UPDATE (L276-292) — diverges from contract §2
- `searchUsers` (L475-477): no `banned_at IS NULL` filter; will need both filters once `deleted_at` exists

### Controller (apps/api/src/modules/users/users.controller.ts)
- GET/PATCH `/users/me/*`, admin-scoped queries
- **No DELETE, no export, no restore**

### i18n (apps/player-pwa/src/messages/en.json + ar.json)
- 717/717 leaf parity, zero drift
- Has `profile.signOutConfirm`, `profile.areYouSure` — currently **unused** on profile (per PWA reviewer)
- **No** delete/export keys — new keys required

## Reviewer findings (Phase 2, #29, OpenCode Go glm-5.3-flash)

### API Reviewer — CRITICAL
1. **No soft-delete anywhere** — `users.deleted_at` column + migration + service method + auth-gate + endpoint all greenfield.
2. **No `/users/me/export` or any export endpoint** — greenfield; consider async/job-shaped to keep request responsive.
3. **`updateProfile` bypasses Mutation Return Contract** — bare `.returning()` (L276-292); standardize on `this.getProfile(userId)` re-read before adding more mutation paths.
4. **FK cascade conflict with soft-delete design** — hard purge at day-30 destroys financial transaction history (PDPL requires retaining txn records). Cascade must be rethought: `SET NULL` + anonymized ghost row, OR explicit retention exception for `transactions`. **This shapes the Gate 1 spec.**

### API Reviewer — IMPORTANT
5. **PDPL export shape leaks third-party data & device identifiers:**
   - `push_subscriptions` carries `endpoint`, `p256dh`, `auth` (device crypto secrets) — export as "your subscription exists" metadata, not raw keys.
   - `activities.subject_id` is an opaque varchar(36) with **no FK** — could reference another user; export must resolve/redact per-verb.
   - `transactions.reference_id`: same untyped-reference problem.
   - `activities` has no `target_user_id` column — only `actor_id`; soft-delete of an actor cascades the whole activity feed away (revisit #4).
6. **`searchUsers` returns soft-deleted / banned users** — no `banned_at IS NULL` filter; once `deleted_at` exists, both must be filtered. `getPublicProfile` (L401) same issue.
7. **`updateProfile` DTO allows `handle` change with no uniqueness-conflict handling** — duplicate handle throws raw 500. Add 409 mapping.
8. **`getPublicProfile` N+1 + unvalidated `:id` param** — controller L106-111 takes `@Param('id')` with no validation; harmless today (varchar(36)) but keep IDs as text params.

### API Reviewer — MINOR
9. `getMyDiscussions` hardcodes `unreadCount: 0` — fine to leave, but mark in export-readiness.
10. `getPomCount` returns `pom_count` without type coercion — consistent, no action.
11. No `console.log` in users module — clean.

### PWA Reviewer — P0
1. **No account-delete UI at all** — no route, entry point, confirm sheet, scheduled-purge date display, or Restore action. Build: `danger` MenuItem below Sign out → `DeleteAccountSheet` modeled on `CancelMatchSheet` (warning box + `isPending`) → persistent "account scheduled for deletion — restore" banner during 30-day grace.
2. **No data-export UI** — no "Download my data" MenuItem, no download flow; also no offline/failed-download retry state.
3. **Sign out is instant and unconfirmed** — `window.location.href` fires immediately; `profile.signOutConfirm`/`profile.areYouSure` keys exist but **unused** on this page. Adjacent unconfirmed destructive action sets bad precedent next to new red Delete entry. **MUST confirm sign-out before shipping delete UI next to it.**

### PWA Reviewer — P1
1. Hydration-gated Settings card hides state: push/quiet-hours only renders `mounted && isSupported`; loading/empty/error states for `useUpdatePushPreferences` don't exist — failures are silent (no toast/`role="alert"`; grep zero hits).
2. Partial 5-state coverage on profile: wallet balance silently falls back to `SAR 0.00` on error — **materially wrong number with no error affordance**; no offline banner.
3. `profile.guestName` fallback masks unauthenticated export/delete: a logged-out visitor could tap Delete and get raw 401. Gate both CTAs on `isAuthenticated` (`:99`).
4. Export needs post-grace restore UX + i18n: scheduled-purge date must render locale-aware (use `useFormatter`), date `<span dir="ltr">`; new keys in en.json + ar.json.

### PWA Reviewer — P2
1. Locale switching via `window.location.href` — fine for i18n freshness, but a user mid-delete-flow loses sheet state.
2. `CancelMatchSheet` unused warning-box copy is match-specific; new `DeleteAccountSheet` should get its own `deleteAccount.*` key namespace.
3. Quiet-hours select uses raw `h:00` numbers without Hindi-numeral handling for AR — minor, but export-purge dates should not repeat it.

## Design decisions for Gate 1 (this cycle)

| # | Question | Decision |
|---|----------|----------|
| 1 | Cascade or retention for transactions on hard purge? | **Retention exception**: drop cascade on `transactions.user_id`; anonymize user_id to a ghost row OR mark user_id NULL + a redacted `user_phone` column. Simplest: KEEP the row, ANONYMIZE phone/name references. (PDPL: financial records must be retained for audit.) |
| 2 | What does "soft-deleted" mean to other systems? | `users.deleted_at IS NOT NULL` → exclude from: searchUsers, getPublicProfile, roster invites, all feed SQL, DM start, match join, all admin queries. Drop push_subscriptions. Anonymize activities.actor_id reference (set `actor_id = NULL`, keep activity row). |
| 3 | 30-day grace? | Hard `now() - 30 days` after `deleted_at`. Restore zeroes `deleted_at`. Background cron (5h cadence is fine) hard-purges the row + the activities referencing it (we kept activities for 30d so user can see history of theirs before purge). |
| 4 | Auth gate for deleted users? | Extend `jwt-cookie.strategy.ts:71` check: `banned_at IS NULL AND deleted_at IS NULL`. Same for WS handshake (app.gateway.ts:108-154). |
| 5 | Export shape? | ONE endpoint: `GET /users/me/export` returns a JSON envelope `{exportedAt, profile, matches, wallet, transactions, disputes, reports, activities, push_subscriptions}`. Profile redaction: drop `verification_status`, drop `banned_at`/`suspended_until` only for non-admin callers (not exported for self). Push subs: drop `p256dh`/`auth`/`endpoint` raw keys, replace with `{type: 'web', createdAt, lastSeen}`. Activities: keep but resolve opaque subject_ids to `{kind: 'match'|'venue'|'user', id, label?}`. |
| 6 | Sign-out confirm? | **Yes** — Reviewer P0 #3. New `SignOutConfirmSheet` modeled on `CancelMatchSheet`. Profile `Sign out` MenuItem now opens the sheet. (Quick slice — same shape as delete confirm.) |
| 7 | Async or sync export? | **Sync** for v1. Expected rows: profile=1, matches<50, wallet=1, transactions<200, disputes<5, reports<5, activities<500, push_subs<5. Total JSON <1MB. Async job queue is over-engineering. Add rate-limit: 1 export / 5 min / user (catches abuse). |
| 8 | Restore endpoint? | `POST /users/me/restore` — only valid if `deleted_at IS NOT NULL AND deleted_at > now() - 30 days`. Returns populated profile. |
| 9 | Anonymize on purge? | On hard purge at 30d: `UPDATE users SET phone = 'deleted:'||id, full_name = 'Deleted User', handle = NULL, avatar_url = NULL WHERE id = $1` — keep the FK target for transactions. |
| 10 | Idempotency on delete? | Yes — second DELETE returns 200 with current `deleted_at`. |

## Out of scope (this cycle)
- Admin-side "deleted users" back-office view → add to #30+
- Async job queue for export → add if latency becomes a problem
- Anonymized ghost user for `actor_id` references → keep activities intact (audit); the redacted phone/name on the users row is enough
- Re-send OTP after restore (deleted user can't log back in without a new OTP) → covered by standard auth flow (deleted users can't send OTP per the gate, restored users can)

## Recommended slices
1. **Schema + migration** — `users.deleted_at` + extend strategy to filter
2. **Service: soft-delete + restore + export** — methods + transactions FK drop
3. **Controller + DTOs** — DELETE /users/me, POST /users/me/restore, GET /users/me/export
4. **PWA: SignOutConfirmSheet** (Reviewer P0 #3 prerequisite)
5. **PWA: DeleteAccountSheet + Restore banner + Export menu** — full UI loop
6. **PWA: Wallet balance error state fix** (Reviewer P1 #2)
7. **PWA: i18n + offline banner** — parity + error affordance
