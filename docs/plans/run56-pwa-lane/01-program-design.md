# Run #56 — Program Design (Gates 1–3 compact)

Two vertical slices, PWA lane. Build order: P1-47 first (P1 beats P2), P2-70 second (tiny).

## Item 1 — P1-47: Banned/suspended localized blocked-account UX

### Problem
A banned or suspended player hits raw English strings ("Account banned.") with no stable machine code and no dedicated surface. Violates the error-message standard (what happened + why + what next, EN+AR).

### User story
As a banned/suspended player (ar or en), when I try to log in / verify / use the app with a stale session, I see a localized full-screen blocked state naming the reason, and for suspensions the exact end date/time in my locale's calendar and numerals.

### Scope
IN: stable `code` on the 4 ban/suspend/deleted throw sites; FetchError carries `code`; classifyError adds `banned`/`suspended`/`deleted` kinds; verify + login screens render a localized BlockedCard for those kinds; new `blocked.*` i18n namespace (EN+AR); tests (API spec, classifyError test, BlockedCard test).
OUT: new blocked route (avoid middleware/redirect churn), admin moderation UI (ADMIN HOLD), WS-side ban messaging, email/deleted-account UX beyond the deleted kind's copy.

### Architecture delta (contracts)

**API — stable codes (object exception bodies; Nest keeps `message` from object responses, so existing `toThrow('Account banned')` spec pins stay green):**
- `users.service.ts:447` → `new ForbiddenException({ message: 'Account banned.', code: 'ACCOUNT_BANNED' })`
- `users.service.ts:451` → `{ message: 'Account suspended.', code: 'ACCOUNT_SUSPENDED' }`
- `users.service.ts:455` → `{ message: 'Account scheduled for deletion.', code: 'ACCOUNT_DELETED' }`
- `auth.service.ts:208` login + `:300` verify → same three codes (banned/suspended only at these two sites)
- `jwt-cookie.strategy.ts:121/124` → `new UnauthorizedException({ message: 'Account banned.'|'Account suspended.', code: 'ACCOUNT_BANNED'|'ACCOUNT_SUSPENDED' })` (strategy throws 401; classifier keys on `code`, not status)
- Response body shape: `{ message: string, code: string, statusCode?: number }` — filter passes HttpException bodies through unchanged (all-exceptions.filter.ts:60-64).

**PWA — fetcher:** `FetchError` gains `readonly code?: string` (4th ctor arg, optional — back-compatible). `apiFetch` extracts `body?.code` alongside `apiMessage`.

**PWA — classifyError:** new kinds `'banned' | 'suspended' | 'deleted'`; matching on `err.code` takes precedence over status mapping; `ERROR_KEYS` gains the three keys; existing callers unaffected (kinds are additive).

**PWA — BlockedCard component** (`src/components/auth/BlockedCard.tsx`, presentational, testable):
```ts
type BlockedReason = 'banned' | 'suspended' | 'deleted';
function BlockedCard({ reason, suspendedUntil }: { reason: BlockedReason; suspendedUntil?: string | null }): JSX.Element
```
- Renders icon + `t('blocked.title')` + `t('blocked.' + reason + 'Title')` + `t('blocked.' + reason + 'Body')`; suspended body embeds `suspendedUntil` formatted via existing `format.ts` (`ar-SA-u-ca-gregory` / `en-GB`), so dates are Hijri-guarded + Arabic-Indic numerals in ar.
- What-next line: banned → `t('blocked.contactSupport')`; deleted → `t('blocked.deletedBody')` (restore hint). Sign-out button → `t('blocked.signOut')` (clears auth, back to login) — dead-UI rule: every control wired.

**i18n (both locales, `blocked` ns + errors kinds):**
- `blocked.title`, `blocked.bannedTitle`, `blocked.bannedBody`, `blocked.suspendedTitle`, `blocked.suspendedBody` (`{date}` placeholder), `blocked.deletedTitle`, `blocked.deletedBody`, `blocked.signOut` — ×2 locales.
- `errors.banned`, `errors.suspended`, `errors.deleted` — ×2 locales (inline error copy for login/verify error lines).

**Screen wiring:**
- verify page: both `onError` handlers → if `classifyError(err)` ∈ {banned, suspended, deleted} render `<BlockedCard reason suspendedUntil={extractSuspendedUntil(err)} />` instead of the inline error line; `extractSuspendedUntil` parses ISO-8601 duration from `err.message` (`/PT(\d+)H/` → local ISO string; helper exported from BlockedCard module + unit-tested).
- login page: `sendOtp`/`sendEmailOtp` `onError` → same kind check → inline `tErrors(kind)` message (full card is verify-only; login keeps inline copy per its layout).
- stale-session 401s (JWT strategy, any authed page): the fetcher's existing 401 self-heal bounces to `/login?...`; login page's OTP send will then hit the ban/suspend code at send-time — the inline copy covers it. No fetcher redirect changes.

### Contract verification checklist (Gate 3 — run explicitly)
- [✓] Mutation rule N/A (no mutations changed; read-side guards only).
- [✓] API JSON shape declared above; `code` is additive — old clients ignore it.
- [✓] Frontend types: `FetchError.code?: string`; `BlockedReason` union; both explicit.
- [✓] Adapter N/A (no new API data shape consumed beyond error body).
- [✓] i18n keys enumerated ×2 locales; parity script stays green.

## Item 2 — P2-70: Offline page copy through locale dicts

### Problem
`[locale]/offline/page.tsx:7-20` hardcodes ar/en copy in a local map (bypasses messages dict, untranslatable by translators, unlintable for parity) + hardcoded English `aria-label`.

### Scope
Move the 3 strings (heading/message/retry) into `common` ns as `offlineTitle` / `offlineMessage` / `offlineRetry` ×2 locales; page reads via `useTranslations`; replace hardcoded aria-label with `t('offlineRetry')`; drop the local i18n map. Verify `/en/offline` + `/ar/offline` render (existing tests + a render assertion if a test file already covers offline; otherwise parity + build green suffices — page is static, no state).

### Success criteria
1. `npx vitest run` green incl. new tests (classifyError kinds, BlockedCard, suspendedUntil parser).
2. `npm run build` (turbo 3/3) zero errors.
3. i18n parity exact (leaf counts equal both locales).
4. API jest green incl. updated ban-code specs.
