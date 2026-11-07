-- ============================================================================
-- Migration 0054: settlements_requested_by index — P2-250 (run #160)
--
-- Reviewer A run-#159 IMPORTANT (b): 0053 added settlements.requested_by
-- (FK → users.id) with NO index, while partner.service.getEarnings LEFT
-- JOINs users on it per earnings read — the only unindexed FK in the 0053
-- set. Index naming mirrors drizzle's conventions for FK columns.
-- Hand-written per the run-#35+ convention (raw SQL + journal entry +
-- prevId-linked snapshot copy); no schema.ts declaration (index-only).
-- ============================================================================

CREATE INDEX IF NOT EXISTS "settlements_requested_by_users_id_idx" ON "settlements" ("requested_by");
