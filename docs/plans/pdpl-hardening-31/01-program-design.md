# pdpl-hardening-31 — Gates 1-3 Program Design (run #31)

## Gate 1 — Product

**Problem:** After PDPL account deletion, residual access paths remain: (a) the restore-token
JWT acts as a full session on every API route; (b) the WebSocket layer never re-checks
`deleted_at`, so a deleted user keeps realtime chat; (c) deleted users' public profiles remain
fetchable by id; (d) the ops console cannot see scheduled-for-deletion accounts (PDPL audit).

**User stories:**
- P0-35: As a deleted user, I expect my public profile to disappear for other players
  immediately (privacy contract of migration 0031).
- P0-36: As a deleted user, the ONLY thing my restore token can do is restore my account;
  as an operator, a leaked restore token must never expose wallet/chat/export.
- P1-37: As an HQ admin, I can list users by deletion status (scheduled / purged) with
  purge-date visibility, to answer PDPL data-subject requests.

**Scope IN:** API strategy scope-gate + window checks; WS deleted_at check; getPublicProfile
filter; purge push_subscriptions cleanup; admin users list `status=deleted` + columns; admin
UI status option + badge; i18n en+ar; specs (strategy gate, service filters, purge cascade).
**Scope OUT:** single-use token table (needs migration; revisit if abuse observed), restore
email receipts (P0-9), money paths (P0-2 parked).

**Success criteria:** turbo build 0 errors; jest + vitest green incl. new specs; PWA list
i18n parity (en/ar leaf keys equal); no behavior change for active users or the restore flow.

## Gate 2 — Architecture

Data flow deltas:
1. `JwtCookieStrategy.validate` → new route+window gate BEFORE returning user (REST surface).
2. `AppGateway.handleConnection` → extend user select with `deleted_at` + explicit reject.
3. `UsersService.getPublicProfile` → add `isNull(users.deleted_at)` to the primary select.
4. `UsersService.purgeExpiredAccounts` → delete push_subscriptions for purged ids.
5. `AdminUsersService.list` + `ListUsersDto.status='deleted'` → deleted-only filter +
   deleted_at column; admin UI status dropdown option + badge + purge-date cell.

Files changed:
- apps/api/src/modules/auth/jwt-cookie.strategy.ts (gate logic + JwtPayload doc)
- apps/api/src/modules/gateway/app.gateway.ts (deleted_at select + reject)
- apps/api/src/modules/gateway/app.gateway.spec.ts (deleted-user rejection case)
- apps/api/src/modules/users/users.service.ts (getPublicProfile filter; purge sub delete;
  restore-token expiry alignment)
- apps/api/src/modules/users/users.pdpl.spec.ts (new cases)
- apps/api/src/modules/users/users.purge-expired.spec.ts (cascade case)
- apps/api/src/modules/auth/jwt-cookie.strategy.spec.ts (NEW — gate matrix)
- apps/api/src/modules/admin/dto/list-users.dto.ts (status enum + 'deleted')
- apps/api/src/modules/admin/users.service.ts (deleted filter + deleted_at col)
- apps/admin/src/lib/types.ts (AdminUser.deleted_at)
- apps/admin/src/app/(dashboard)/users/page.tsx (status option, badge, purge cell)
- apps/admin/src/messages/en.json + ar.json (status.deleted, hq.thPurgeScheduled)
- apps/api/drizzle/0004_restore_token_expiry_note.sql — NOT NEEDED (no schema change)

No DB migration required (uses existing users.deleted_at, push_subscriptions.user_id).

## Gate 3 — Program Design (contracts)

### API JSON shapes (unchanged where noted)
- `GET /users/:id` → 404 `{"message":"User not found.","error":"Not Found","statusCode":404}`
  when deleted_at IS NOT NULL (was 200 with profile). Active users: shape unchanged.
- `POST /users/me/restore` with purpose:restore JWT → `{ id, phone, full_name, handle,
  avatar_url, preferred_position, skill_level, preferred_location, karma_score, rating, ... }`
  (getProfile shape — UNCHANGED, the one allowed restore action).
- `POST /users/me/restore` with purpose:restore JWT past window → 403
  `{"message":"Restore window has expired...","statusCode":403}`.
- ANY other route with purpose:restore JWT while deleted → 403
  `{"message":"This token can only restore the account.","statusCode":403}` (route-strict:
  restore token is NOT a session token; covers wallet/export/chat AND /admin/* ops surface).
- Any other guarded route with a regular (purpose-less) JWT while deleted → 401 (unchanged).
  After successful restore (deleted_at NULL): all routes behave normally.
- `GET /admin/users?status=deleted` → `{ users: [...rows with deleted_at added],
  total, page, perPage }`; rows carry `"deleted_at": "<iso>|null"`.

### TS signatures
```ts
// jwt-cookie.strategy.ts
async validate(payload: JwtPayload): Promise<JwtPayload>
// behavior: after user row fetch —
//   if (deleted_at) {
//     if (purpose !== 'restore') throw 401 'Account scheduled for deletion.'
//     if (isAdminPath(req)) throw 403 'This token can only restore the account.'
//     if (now - iat > 30d) throw 403 'This token can only restore the account (expired).'
//   }
// (req) param added; passport passes request when { passReqToCallback: true }.

// app.gateway.ts handleConnection — select gains deleted_at; reject:
//   if (user.deleted_at) disconnect + warn 'account deleted (PDPL)'

// users.service.ts
async getPublicProfile(userId: string, currentUserId?: string)  // where gains isNull(deleted_at)
async purgeExpiredAccounts(): Promise<number>  // + delete push_subscriptions where user_id in purgedIds
```

### Adapter/hook contract (PWA)
No PWA code changes: `fetcher.getBearerForRequest` already sends the restore token ONLY for
`/users/me/restore` (fetcher.ts:40-55) — the strategy gate matches the client contract
exactly. RestoreAccountBanner flow unchanged (401-expiry path now becomes 403 → same inline
error handling; verify vitest restore-fetcher cases still pass, adjust expectation only if
they assert status 401 for expiry — check test/lib/fetcher*.test.ts).

### i18n contracts (admin)
- en.json `status.deleted` = "Deleted", ar.json = "محذوف"
- en.json `hq.thPurgeScheduled` = "Purge scheduled", ar.json = "الحذف النهائي المجدول"
- No other keys; 393→395 leaf-key parity must hold (0 diff programmatic check).

### Gate 3 contract verification checklist
- [x] Every mutation endpoint unchanged in return shape (no mutation touched; restore return
      still `this.getProfile()` outside tx)
- [x] Frontend types accept the JSON: AdminUser gains `deleted_at: string | null` — matches
      `userColumns` addition; PWA types untouched
- [x] Adapter functions exist: PWA restore path already adapter-free (fetcher Bearer fallback
      verified at fetcher.ts:40-55); admin page reads rows directly
- [x] No field silently undefined: deleted_at added to BOTH userColumns and AdminUser type
- [x] i18n keys exist in BOTH languages before UI renders them (en+ar written in same commit)
