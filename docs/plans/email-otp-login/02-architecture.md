# 02 — Architecture: Email + OTP Login

## Key design decisions (with reasons)

| Decision | Choice | Why |
|---|---|---|
| Email-first users' phone | Migration 0038: `ALTER TABLE users ALTER COLUMN phone DROP NOT NULL` (unique constraint STAYS — PG allows multiple NULLs) | Phone-first schema is the only blocker; placeholder phones would poison display/redaction semantics |
| Where OTP email is sent from | `mailer` module gains a `ResendService` provider (HTTPS API, free tier 100/day) | P0-9 already scoped mailer as the email home; auth consumes it |
| OTP storage | Reuse `otp-store.service` with keys `email:<addr>` — cooldown/daily/IP caps reused as-is | Same abuse semantics, zero new state |
| User enumeration | `send-otp` always answers 202 | Standard anti-enumeration; real signal arrives by email presence |
| JWT delivery on prod (Render↔Vercel cross-origin) | `verify-otp`/`email verify` set the cookie AS BEFORE **and**, when the client explicitly sends `responseToken: true` (PWA does on web), also return `token` in the body | Third-party cookie blocking makes cross-origin Set-Cookie unreliable; documented P2-11 exception (explicit opt-in, swagger-documented, never logged). Phase-2 Coolify same-domain will obsolete it |
| New users' role/wallet | role=Player, wallet_balance=0 (existing defaults) | Identical to phone path |

## Flow

```
PWA login ──"Continue with email"──► email form
  POST /auth/email/send-otp {email} ──► [new? create user(phone NULL)] ──► Resend 6-digit
PWA verify (reuse verify page) ──► POST /auth/email/verify-otp {email, code, surface, responseToken}
  ├─ success: email_verified_at=now(), JWT cookie (+ body token when requested)
  └─ new user → complete-profile (existing flow, unchanged)
```

## Component changes

| File | Change |
|---|---|
| `apps/api/drizzle/0038_email_login.sql` (NEW) | phone DROP NOT NULL (idempotent-guarded, hand-written per VPS convention) + journal row in same commit (run-#39 trap) |
| `apps/api/src/database/schema.ts` | phone column `.notNull()` removed |
| `apps/api/src/modules/mailer/resend.service.ts` (NEW) | thin Resend HTTPS client; graceful log-fallback when `RESEND_API_KEY` empty (mirrors Unifonic pattern) |
| `apps/api/src/modules/mailer/mailer.module.ts` | export ResendService |
| `apps/api/src/modules/auth/email-otp.service.ts` (NEW) | requestEmailOtp / verifyEmailOtp (reuses otp-store, authservice JWT minting pattern) |
| `auth.controller.ts` | + `POST email/send-otp`, `POST email/verify-otp`; existing verify-otp gains optional `responseToken` |
| `apps/player-pwa` login page | subtle toggle link + email input state |
| `apps/player-pwa` verify page | accept `channel=email` param (reuse UI; send to email endpoints) |
| `hooks/useAuth.ts` | + `useEmailSendOtp`, `useEmailVerifyOtp` (mirror phone hooks) |
| i18n `en/ar` login ns | `emailToggle`, `emailPlaceholder`, `emailSent`, keys ×2 languages |
| Render env | `RESEND_API_KEY` (value already in `.deploy-tokens`) |

## Risks

| Risk | Mitigation |
|---|---|
| phone NOT NULL assumed in code (display/redaction/admin) | grep audit pre-migration; redaction helper handles null (returns null) |
| Resend delivers only to Abdullah's own email until domain verified | staging E2E with his address; prod gate = domain verified (dashboard step, documented) |
| P2-11 exception abuse | explicit client flag + only on verify endpoints + JWT expiry unchanged; swagger note |
| factory lock collisions | code only when `kanban/LOCK.json` absent (deploy script enforces for builds) |
