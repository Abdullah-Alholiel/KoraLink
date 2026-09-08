-- ============================================================================
-- Migration 0037: ActivityVerb 'phone_changed' (run #44, 2026-09-08, P1-19)
--
-- The phone-change flow (PATCH-equivalent /users/me/change-phone/*) writes an
-- audit activity when a user moves their account to a new number. The
-- activities.verb column is the ActivityVerb enum — 19 values, none
-- phone-related. This adds the audit verb.
--
-- 0018 TRAP: PostgreSQL cannot ALTER TYPE ... ADD VALUE inside a transaction
-- that later USES the new value. Keep this migration to the single ADD VALUE
-- statement (drizzle splits on --> statement-breakpoint; one statement = no
-- risk). Hand-written per the 0030+ convention (no snapshot json; journal
-- entry appended in the same commit as this file).
-- Idempotency note: plain ADD VALUE is not IF NOT EXISTS-capable on PG < 9.6
-- idiom; if this migration ever re-fires on a DB that already has the value,
-- it will fail LOUDLY (duplicate value) rather than silently — the journal
-- bookkeeping row prevents re-firing on the live DB.
-- ============================================================================

ALTER TYPE "ActivityVerb" ADD VALUE 'phone_changed';
