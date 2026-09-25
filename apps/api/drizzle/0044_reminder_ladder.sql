-- ============================================================================
-- Migration 0044: match-start reminder ladder (P2-100, run #74).
--
-- The scheduler sends match-start reminders on a single leg (T-45m,
-- reminders_sent_at). Board item P2-100 adds a DAY-AHEAD leg (T-24h) so
-- players get a calendar-anchoring touch the day before kickoff and late
-- joiners are covered by the two-leg ladder. This column is the per-leg
-- stamp-once guard (mirrors reminders_sent_at); NULL = the T-24h reminder
-- has not fired yet.
--
-- NOTE: hand-written migration per VPS convention (drizzle-kit broken here;
-- __drizzle_migrations bookkeeping row added by the apply step —
-- scripts/migrate-vps.mjs). All id columns are varchar(36) — ::text casts
-- only, never ::uuid.
-- ============================================================================

ALTER TABLE "matches" ADD COLUMN "reminders_24h_sent_at" timestamp WITH time zone;
