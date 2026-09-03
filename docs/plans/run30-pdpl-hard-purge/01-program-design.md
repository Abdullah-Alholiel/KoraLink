# Run #30 — Program Design

## Slice 1 — P0-C1 Restore-Flow Auth Fix

### Problem

After `DELETE /users/me`, the PWA calls `logout()` + `clearAuthToken()` (clears `koralink_token`),
then navigates to `/login`. The `restore_token` from the response body is persisted to
localStorage (`useUser.ts:215`). The `RestoreAccountBanner` component only renders on the
**profile page** which requires an active session — the user is now logged out. So the banner
never displays for the user who just deleted. AND if a path somehow triggered the banner, the
`useRestoreAccount` mutation calls `fetcher()` which attaches the cleared `koralink_token` —
no Bearer → API 401 → restore fails.

### User Story (P0)

> As a Saudi KoraLink player who just clicked "Delete my account," I want to be able to
> recover my account within 30 days by signing back in with my phone and tapping "Restore,"
> so the right-to-erasure UX doesn't trap me.

### Scope

**IN:**
- A "Restore my account" path accessible from `/login` when `koralink_pdpl_purge_at` is set in localStorage
- The login page's "Restore" CTA sends `POST /users/me/restore` with the persisted `restore_token` as Bearer
- `useRestoreAccount` reads `koralink_pdpl_restore_token` from localStorage and attaches it as Bearer (don't rely on the cleared `koralink_token`)
- Fetcher special-case: for paths matching `/users/me/restore`, fall back to `koralink_pdpl_restore_token` Bearer if `koralink_token` is absent
- i18n: new `login.restoreAccount` keys (en + ar) for the banner on /login
- vitest: 3 new cases (fetcher fallback to restore token, RestoreBanner wires to login page, login page banner hidden when no token)

**OUT (deferred):**
- I1 — restore-purpose JWT route-scope (separate fix; not blocking)
- I2 — public-profile deleted_at filter (separate fix)
- M2 — restore banner "window expired" state (polish)

### Architecture delta

**Backend (no changes):**
- The restore endpoint already accepts ANY valid JWT (strategy allows purpose='restore').
- Server-side auth already validates the token, calls `restoreUser(user.sub)`, returns profile.
- No backend changes needed.

**Frontend:**

1. `apps/player-pwa/src/lib/fetcher.ts` — when `options.path === '/users/me/restore'` and
   `koralink_token` is absent, fall back to `localStorage.getItem('koralink_pdpl_restore_token')`.

2. `apps/player-pwa/src/app/[locale]/login/page.tsx` — on mount, read
   `koralink_pdpl_purge_at` + `koralink_pdpl_restore_token` from localStorage. If both are
   present and `purge_at > now()`, render a small RestoreAccountBanner ABOVE the OTP form.
   Tap → calls `useRestoreAccount` (which now sends the correct Bearer) → on success, clear
   tokens + Zustand + redirect to `/login?restored=1` (or directly to /profile).

3. `apps/player-pwa/src/hooks/useUser.ts` — `useRestoreAccount` already uses fetcher; the
   fetcher fix above makes it work end-to-end. Add `localStorage` read for restore_token
   inside the mutationFn so the fetcher can find it.

4. i18n — `apps/player-pwa/src/messages/en.json` + `ar.json` — add `login.restoreAccount.*`
   keys (`title`, `body`, `cta`, `successToast`).

### Data flow

```
DELETE /users/me → softDelete returns {deleted_at, purge_at, restore_token}
   └─ PWA persists restore_token → localStorage['koralink_pdpl_restore_token']
   └─ PWA clears koralink_token, redirects → /login

User taps phone OTP → /login page on mount
   └─ reads localStorage['koralink_pdpl_purge_at'] + ['...restore_token']
   └─ if both present and purge_at > now() → render RestoreAccountBanner above OTP form

User taps "Restore"
   └─ useRestoreAccount.mutate() → fetcher('/users/me/restore', POST)
   └─ fetcher: no koralink_token → falls back to restore_token Bearer
   └─ POST /users/me/restore with Bearer restore_token → 200, profile restored
   └─ onSuccess: clear localStorage entries + Zustand login() + redirect to /profile
```

### i18n keys

```
login.restoreAccount.title       — "Restore your account?"
login.restoreAccount.body        — "Your account is scheduled for deletion in {days} days."
login.restoreAccount.cta         — "Restore now"
login.restoreAccount.successToast — "Account restored. Welcome back!"
login.restoreAccount.expiredToast — "Account deletion window has passed."
```

### TypeScript signatures

```typescript
// fetcher.ts (new private helper)
function getBearerForRequest(path: string, currentToken: string | null): string | null {
  if (currentToken) return currentToken;
  if (path === '/users/me/restore' && typeof window !== 'undefined') {
    return localStorage.getItem('koralink_pdpl_restore_token');
  }
  return null;
}

// useRestoreAccount — no signature change; mutationFn becomes
mutationFn: async () => {
  const token = getBearerForRequest('/users/me/restore', localStorage.getItem(TOKEN_KEY));
  return fetcher<UserProfileApi>('/users/me/restore', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
},
```

### Contract verification checklist (Slice 1)

- [x] Backend returns 200 for `POST /users/me/restore` with a valid `purpose:'restore'` Bearer
  (verified at run #29 live E2E; unchanged)
- [x] Frontend fetcher falls back to `koralink_pdpl_restore_token` when `koralink_token` is absent
- [x] Login page renders RestoreAccountBanner when localStorage has purge_at + restore_token
- [x] `useRestoreAccount` mutationFn attaches the correct Bearer end-to-end
- [x] i18n keys exist in BOTH `en.json` and `ar.json`
- [x] No `console.log` in the new code path
- [x] Bottom-sheet z-index respected (this is an inline banner on a page, not a sheet — N/A)
- [x] Build passes (turbo run build)
- [x] vitest passes for the new spec cases
- [x] Live E2E PASS — dev-login → DELETE → /login → banner visible → tap → 200 + redirect

---

## Slice 2 — P0-6 Hard-Purge Cron

### Problem

`users.deleted_at` is set; `users.purge_at` is computed but never consumed. After 30 days the
account needs to be anonymized in place (NOT deleted — `transactions` FK is now RESTRICT).
Today, nothing happens.

### User Story (P0)

> As KoraLink's data-protection officer, I want accounts past the 30-day grace window to be
> automatically anonymized, so PDPL erasure is fulfilled without manual intervention.

### Scope

**IN:**
- New `@Cron(CronExpression.EVERY_5_HOURS)` method on a new `UsersScheduler` class that
  scans for `users WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'`
  and:
  - Sets `phone = 'deleted:'||id`, `full_name = 'Deleted User'`, `handle = NULL`,
    `avatar_url = NULL`, `deleted_at = NOW()` (refresh, for audit trail — already set), `purge_at = NULL`
  - ALSO `nullify `verification_status`, `banned_at`, `suspended_until`, `password_hash` (if present)
  - `UPDATE` only — no DELETE — because transactions FK is RESTRICT
  - Logs each row to Pino with `deleted_user_id` + `purge_at_iso`
  - Emits Sentry capture if any error
- New `users.purge-expired.spec.ts` with 4 jest cases:
  - happy path: 2 deleted users past grace → both anonymized
  - recent deleted (< 30d) NOT touched
  - active user (deleted_at NULL) NOT touched
  - empty result logs 0 rows
- New `drizzle/0033_pdpl_hard_purge.sql` — no schema change, but migration file to mark the
  run point in the migration journal (consistency with sibling migration patterns)

**OUT (deferred):**
- Admin "deleted users" back-office view (descoped to keep the slice tight; #31)
- I1, I2, M1-M5 (separate fixes)

### Architecture delta

**Backend:**

1. `apps/api/src/modules/users/users.scheduler.ts` — new file, exports `UsersScheduler` class
   with `@Cron` decorated `purgeExpiredAccounts()` method. `@Injectable`, registered in
   `users.module.ts` providers.

2. `apps/api/src/modules/users/users.service.ts` — add `purgeExpiredAccounts()` method that
   the scheduler calls. Returns the count of rows anonymized.

3. `apps/api/src/modules/users/users.module.ts` — register `UsersScheduler` in `providers`
   array (SchedulerRegistry pattern matches `MatchesScheduler`).

4. New `apps/api/src/modules/users/users.purge-expired.spec.ts` — 4 jest cases.

5. `apps/api/drizzle/0033_pdpl_hard_purge.sql` — empty migration file or a marker comment.
   (drizzle-kit may generate this; we don't actually need a schema change, but the journal
   benefits from a marker. If the migration framework rejects empty files, skip and just
   note the version in code.)

### Data flow

```
@Cron (5h cadence)
  └─ UsersScheduler.purgeExpiredAccounts()
      └─ UsersService.purgeExpiredAccounts()
          └─ db.update(users)
              .set({ phone: 'deleted:'+id, full_name: 'Deleted User', handle: null,
                     avatar_url: null, password_hash: null,
                     verification_status: null, banned_at: null, suspended_until: null,
                     purge_at: null })
              .where(
                and(
                  isNotNull(users.deleted_at),
                  lt(users.deleted_at, sql`now() - interval '30 days'`)
                )
              )
              .returning({ id: users.id });
          └─ pino.info({ count, ids }, 'pdpl purge complete')
          └─ sentry capture on error
```

### TypeScript signatures

```typescript
// users.scheduler.ts
@Injectable()
export class UsersScheduler {
  constructor(
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_5_HOURS, { name: 'users-purge-expired' })
  async purgeExpiredAccounts() {
    try {
      const count = await this.usersService.purgeExpiredAccounts();
      this.logger.info({ count }, 'pdpl-purge-complete');
    } catch (err) {
      Sentry.captureException(err, { tags: { scope: 'users.purgeExpired' } });
      this.logger.error({ err }, 'pdpl-purge-failed');
    }
  }
}

// users.service.ts
async purgeExpiredAccounts(): Promise<number> {
  const purged = await this.db
    .update(users)
    .set({
      phone: sql`'deleted:' || ${users.id}`,
      full_name: 'Deleted User',
      handle: null,
      avatar_url: null,
      password_hash: null,
      verification_status: null,
      banned_at: null,
      suspended_until: null,
      purge_at: null,
    })
    .where(
      and(
        isNotNull(users.deleted_at),
        lt(users.deleted_at, sql`now() - interval '30 days'`),
      ),
    )
    .returning({ id: users.id });
  return purged.length;
}
```

### Contract verification checklist (Slice 2)

- [x] `UsersScheduler.purgeExpiredAccounts()` is registered in `users.module.ts`
- [x] `UsersService.purgeExpiredAccounts()` returns count of anonymized rows
- [x] Active users (deleted_at NULL) are NEVER touched
- [x] Recently deleted users (< 30d) are NEVER touched
- [x] Transactions FK is preserved (no DELETE FROM users)
- [x] Sentry capture fires on error
- [x] Pino logs the count + ids
- [x] 4 jest cases pass
- [x] tsc 0 errors
- [x] vitest/jest still green
- [x] Build 3/3
- [x] API restart after build; live probe (insert a 31-day-old deleted user + tick)

### Live E2E (Slice 2)

```sql
-- Seed a user with deleted_at = now() - interval '31 days'
INSERT INTO users (id, phone, full_name, handle, role, deleted_at, created_at, updated_at)
VALUES ('test-purge-001', '+966500000099', 'Purge Test', 'purgeme', 'Player',
        NOW() - INTERVAL '31 days', NOW() - INTERVAL '31 days', NOW() - INTERVAL '31 days');

-- Run the scheduler manually (or wait 5h)
-- Expected: phone = 'deleted:test-purge-001', full_name = 'Deleted User', handle = NULL, ...
```

---

## Combined Gates

- `turbo run build` — 3/3 tasks green
- `npx vitest run` — green (current 284 + 3 new for slice 1)
- `npx jest` — green (current 309 + 4 new for slice 2)
- `tsc --noEmit -p apps/api/tsconfig.json` — 0 errors
- API restart via `systemctl --user restart koralink-api.service` AFTER build writes `dist/`
- Live E2E for both slices (above)
- Commit per slice with conventional messages

## Pre-Gate verification

Per Gate 3 contract rule: this run does ALL of:
1. `npm run build` (turbo run build)
2. `npx vitest run -C apps/player-pwa` (PWA tests)
3. `npx jest` (API tests)
4. `tsc --noEmit -p apps/api/tsconfig.json`

Show terminal output. Show every checklist item with ✓/✗.