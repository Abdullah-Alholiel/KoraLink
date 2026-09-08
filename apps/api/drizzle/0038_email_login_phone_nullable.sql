-- ============================================================================
-- Migration 0038: email login — users.phone nullable (run #46, 2026-09-08)
--
-- Email+OTP login (docs/plans/email-otp-login/): new users may sign up with
-- ONLY an email address. users.phone was NOT NULL — that is the single schema
-- blocker. The UNIQUE constraint STAYS: Postgres treats NULLs as distinct, so
-- multiple email-only accounts (phone NULL) coexist while real numbers remain
-- unique (phone-change flow enforces ownership via SMS OTP as before).
--
-- Hand-written per VPS convention (drizzle-kit unavailable here; journal row
-- appended in _journal.json in the SAME commit — run-#39 rule).
-- Idempotent-in-effect: DROP NOT NULL on an already-nullable column is a
-- no-op success in Postgres.
-- ============================================================================

ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
