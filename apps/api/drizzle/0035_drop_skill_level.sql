-- ============================================================================
-- Migration 0035: drop users.skill_level + SkillLevel enum type
-- Owner directive (Abdullah, 2026-09-06): "drop skill level from everywhere —
-- no one can testify that." Full standardisation: UI, DTOs, API, DB.
-- Hand-written per VPS convention (drizzle-kit broken here);
-- __drizzle_migrations bookkeeping row added by the apply step.
-- ============================================================================
-- SAFETY: users.skill_level must be the ONLY column in the database using the
-- "SkillLevel" enum type. The apply step verifies this via information_schema
-- before the DROP TYPE runs.

-- 1) drop the column (IF EXISTS → idempotent re-run)
ALTER TABLE "users" DROP COLUMN IF EXISTS "skill_level";

-- 2) drop the enum type (users.skill_level was its only consumer — verified)
DROP TYPE IF EXISTS "SkillLevel";
