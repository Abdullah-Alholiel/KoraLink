# 03 — Program Design: Email OTP contracts

## Endpoints (exact shapes)

### POST /api/v1/auth/email/send-otp
Request: `{ "email": "user@example.com" }` (validated `IsEmail`, lowercased server-side)
`202` → `{ "message": "If that address can receive login codes, an email is on its way." }`
(always-202 anti-enumeration; caps: `@Throttle 3/min` + otp-store cooldown/daily/IP keyed `email:<addr>`)
`429` → standard Nest rate-limit shape. Errors NEVER distinguish existing/new email.

### POST /api/v1/auth/email/verify-otp
Request: `{ "email": "…", "code": "123456", "surface": "player" | "ops" (optional), "responseToken": true (optional) }`
`200` → `{ "isNewUser": boolean, "token": string (ONLY when request had responseToken:true — P2-11 documented exception) }`
+ `Set-Cookie: access_token=<jwt>; HttpOnly; SameSite=strict(lax on staging); secure(prod); Path=/; Max-Age=7d`
JWT payload: `{ sub: user.id, email: user.email, role: user.role }` (phone omitted when NULL)
`400` wrong/expired code (increments fail counter; 5-fail lockout reuses FAIL_LIMIT semantics)
Side-effect on first success: `users.email_verified_at = now()`.

## Service signatures (TypeScript)

```ts
// email-otp.service.ts
requestEmailOtp(email: string, ip?: string): Promise<void>;
verifyEmailOtp(email: string, code: string, surface?: 'player'|'ops'): Promise<{ token: string; isNewUser: boolean }>;
// resend.service.ts
send(to: string, subject: string, html: string): Promise<void>; // logs when RESEND_API_KEY empty
```

## Frontend hooks

```ts
useEmailSendOtp(): { sendEmailOtp(email): void; isSending: boolean };
useEmailVerifyOtp(): { verifyEmailOtp(vars): void; isVerifying: boolean }; // onSuccess: login(user, token) + route
```

## i18n keys (login ns; EN + AR both REQUIRED)

| Key | EN | AR |
|---|---|---|
| `login.emailToggle` | Continue with email instead | تابع بالبريد الإلكتروني بدلاً من ذلك |
| `login.phoneToggle` | Use phone number instead | استخدم رقم الجوال بدلاً من ذلك |
| `login.emailPlaceholder` | Email address | البريد الإلكتروني |
| `login.emailSent` | Check your inbox for the code | تحقق من بريدك الوارد للحصول على الرمز |
| `login.invalidEmail` | Enter a valid email address | أدخل بريدًا إلكترونيًا صحيحًا |

Verify page reuses existing `verify.*` keys (no new keys needed — channel-agnostic wording).

## Migration 0038 (hand-written, VPS convention — journal row SAME commit)

```sql
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
```
Guard: statement is idempotent-in-effect (re-run errors benignly caught by applier's
duplicate-tolerance? NO — DROP NOT NULL on already-nullable = success no-op in PG; safe).
Audit before merge: `grep -rn 'user.phone' apps/api/src apps/admin/src` → every consumer
must tolerate NULL (display sites already run through the `+966****XXXX` redaction helper —
update it to return null for null phone).

## Checklist (Gate 3 verification)

- [x] Every new endpoint has exact JSON req/resp documented (202 anti-enum shape included)
- [x] Cookie flags per environment documented; P2-11 exception scoped to explicit opt-in
- [x] TS signatures explicit; hooks mirror existing phone-hook patterns
- [x] i18n keys EN+AR enumerated before implementation (drift trap §13)
- [x] Migration idempotent + journal-row-same-commit (run-#39 trap)
- [x] Abuse caps enumerated (reuse, keyed email:<addr>)
