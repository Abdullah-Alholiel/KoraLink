# 01 — Product Spec: Email + OTP Login (subtle secondary auth channel)

## Problem statement

KoraLink login is phone+SMS only. SMS costs money (Unifonic, not yet wired), and until the
AppSid lands, real signups are impossible on prod. Abdullah's decision (2026-09-08): add a
**subtle email option** — "log in via email instead" — with the OTP delivered by EMAIL
(free tier-friendly via Resend). This also resolves board item P0-9 (email infra — owner
call now made: Resend).

## User stories

- **S1 (P0) Subtle toggle**: On the login screen, a low-emphasis link "Continue with email
  instead" (EN/AR) switches the same screen to email entry. Visual style: secondary text
  link under the phone form — never a co-equal tab.
- **S2 (P0) Email OTP**: User enters email → receives a 6-digit code by email (Resend) →
  enters code → logged in. Same verify screen as phone (reused), code semantics identical.
- **S3 (P0) Signup via email**: New email = account created automatically (phone NULL),
  then the existing complete-profile flow. Existing user with verified email = direct login.
- **S4 (P1) Verification-gated**: Only `email_verified_at` addresses can log in; the OTP
  verify step IS the verification (sets `email_verified_at` on first success).
- **S5 (P2) Unify later**: A user's email ↔ phone can be linked from profile settings —
  OUT OF SCOPE this cycle (board follow-up).

## Scope

IN: toggle UI (login page), email send-otp + verify-otp endpoints, Resend provider in the
mailer module, migration 0038 (phone nullable), abuse caps (reuse otp-store keyed by
`email:<addr>`), i18n EN+AR, tests. OUT: profile email-linking UI, Unifonic SMS, admin
changes, domain verification automation (dashboard step, Abdullah), email templates beyond
the OTP one.

## Success criteria

1. Staging: enter email → receive code (Resend test delivery to Abdullah's own address or
   log-fallback if key absent) → verify → `/users/me` 200 → complete-profile → feed loads.
2. Prod (after promote): same E2E with a REAL email received in an inbox.
3. Existing phone user with verified email can log in via email (same account, same JWT sub).
4. Abuse caps hold: 60s resend cooldown, per-email daily cap, per-IP daily cap (same code path).
5. `turbo build` + vitest/jest green; new endpoints return exact Gate-3 shapes.
6. No regression on phone login (staging dev-login + full OTP path still green).
