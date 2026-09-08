# Run #44 — P1-19 Phone-Change Flow (compact Gates 0–3)

## Gate 0 — Retro (area audit, live-verified 2026-09-08)

- OTP chain: `AuthService.sendOtp` (cooldown 60s, 10/day/phone, 50/day/IP, PDPL deleted-block)
  → `UnifonicService.sendSms` (no creds ⇒ logs to journald — live-E2E source)
  → `OtpStoreService` (Redis cache-manager, 5-min TTL, 5-fail lockout).
  All counters are keyed by `otp:<phone>` — REUSED for login. A phone-change flow that
  validated against `getOtp(newPhone)` would let a login OTP mint the change (cross-flow
  replay). ⇒ change flow gets its OWN key namespace (`otp:change:*`), sharing only the
  cooldown/daily/IP/fail caps.
- `PATCH /users/me` (UpdateProfileDto) has NO phone field; phone is `varchar(36)`… actually
  `varchar(20)`, `unique` (schema.ts:201). Uniqueness → PG 23505 → must map to localized 409.
- `activityVerbEnum` (schema.ts:94): 19 verbs, no phone verb → migration 0037
  `ALTER TYPE "ActivityVerb" ADD VALUE 'phone_changed'`.
  **0018 trap**: an enum ADD VALUE can't run inside the same tx as its consumer statements →
  keep 0037 single-statement.
- Session reality: `JwtCookieStrategy.validate` resolves the user by `sub` (id) and ignores the
  `phone` claim → after a phone change the live JWT keeps working; NO re-issue needed.
  New logins use the NEW number (old number 404s at verify).
- PDPL interaction: `sendOtp` blocks soft-deleted rows — change flow mirrors that guard.
- Audit convention: `activities` rows (actor_id, verb, subject_id). Feed template has no
  `phone_changed` entry → no feed fan-out needed (feed_items only created where the feed
  template inserts them — verified: activities insert sites pair with feed templates).

## Gates 1–2 — Product/Architecture (compact)

Problem: OTP phone is the sole credential. A lost SIM = permanent lockout; PDPL
soft-delete+recreate is the only escape (loses history, 30-day wait).
User story: As a logged-in player who lost their SIM, I can move my account to a new
number by proving possession of the new number via OTP, without losing anything.
Scope IN: `POST /users/me/change-phone/request` + `POST /users/me/change-phone/verify`
(auth-guarded), PWA Personal-Info section (existing `profile.changePhone` keys + new keys),
EN+AR, tests, migration 0037, observability.
Scope OUT: admin-triggered changes, email-based proof, ops console UI, SMS content i18n.

## Gate 3 — Contracts (the gate)

### API shapes (exact JSON)

POST /api/v1/users/me/change-phone/request  (JwtCookieAuthGuard; global throttler + OTP caps)
  body: { "phone": "+9665xxxxxxxx" }            // E.164, @IsPhoneNumber('SA')
  200 → { "message": "OTP sent to your new number.", "cooldownSeconds": 60 }
  401 no/invalid session · 403 account banned/suspended/deleted ·
  409 { "message": "This phone number is already registered.", "error": "Conflict" }
      (normalized from PG 23505 + pre-check, same shape both paths)
  429 cooldown/daily/IP cap (HttpException shape identical to auth send-otp)
  500 → Sentry captureException + Pino error log (SMS dispatch failure AFTER OTP stored
        → OTP deleted, error rethrown; user retries with no stale code)

POST /api/v1/users/me/change-phone/verify
  body: { "phone": "+9665xxxxxxxx", "code": "123456" }   // code 6 digits
  200 → { "id","phone","full_name","handle","avatar_url","preferred_location",
          "preferred_position","role" }                    // same shape as PATCH /users/me
  400 mismatch vs request-step number · 401 invalid/expired OTP (fail counter++)
  409 number taken in the race window (23505) · 429 5-fail lockout (15 min)

### TS signatures

```ts
// users.service.ts
async requestPhoneChange(userId: string, newPhone: string, ip?: string): Promise<{ message: string; cooldownSeconds: number }>
async verifyPhoneChange(userId: string, newPhone: string, code: string): Promise<UpdatedProfile>
// otp-store.service.ts (scoped namespace; caps shared with login OTP)
async getChangeOtp(phone): Promise<string|undefined>
async setChangeOtp(phone, code): Promise<void>   // 5-min TTL
async deleteChangeOtp(phone): Promise<void>
```

### Adapter/hook contract

No new adapter — verify response feeds the existing profile consumers:
`useChangePhone().mutateAsync({ phone, code })` → on success:
`queryClient.setQueryData(['user','profile'], updated)` + `updateUser({ phone })` (Zustand).

### i18n contract (profile ns; surgical text insertion, both files)

existing reused: `profile.changePhone`, `profile.phoneNumber`
new: changePhoneSubtitle, changePhoneNewNumber, changePhoneNewNumberPlaceholder,
changePhoneSendCode, changePhoneVerifyTitle, changePhoneVerifySubtitle,
changePhoneCodeLabel, changePhoneVerify, changePhoneResend, changePhoneSuccess,
changePhoneErrorTitle, changePhoneNumberTaken, changePhoneSameNumber,
changePhoneInvalidNumber, changePhoneSave, changePhoneCancel  → 16 new keys EN+AR
(error kind fallbacks reuse the errors.* ns: validation/rateLimited/conflict/server).

### Contract checklist (Gate 3 verification — run again before Gate 4 claims)

- [x] Mutation endpoint returns fully populated profile object (verify) — request returns status shape
- [x] PWA types accept the exact JSON (UpdatedProfile = PATCH /users/me returning shape)
- [x] Adapter: none needed — response is the established profile shape
- [x] No field silently undefined: explicit column projection in .returning()
- [x] i18n keys exist in BOTH locales before component references them (surgical insertion)
- [x] Unique-violation → 409 with localized copy (pre-check + 23505 catch)
- [x] Login-OTP reuse forbidden BOTH directions (separate otp:change:* keys)
- [x] Per-IP/per-phone caps inherited (same OtpStoreService counters)
- [x] Enum migration single-statement (0018 ADD VALUE trap)
