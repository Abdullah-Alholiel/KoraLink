-- ============================================================================
-- Migration 0051: admin_edit_version_tokens — P2-192 (run #130)
--
-- Optimistic-edit version tokens for the admin dispute/report edit surface
-- (companion to P2-191's status-predicated guards): two admins editing the
-- same decision/note/resolution while status is unchanged previously hit
-- last-write-wins silently. `version integer NOT NULL DEFAULT 1` is bumped
-- ONLY by the guarded admin update() (admin/disputes.service.ts +
-- admin/reports.service.ts); the UPDATE's WHERE carries
-- `AND version = <findOne saw>` so a concurrent edit loses the race with a
-- 409 that echoes the current version for client resync.
--
-- Hand-written raw-SQL-only migration (0047/0049/0050 convention): no schema
-- declaration change beyond the two column lines; snapshot copied from 0050
-- with fresh id + prevId chain (run-#39/#103 journal contract; 8 tripwire
-- suites must pass before push). Idempotent (IF NOT EXISTS). Backfill is
-- implicit: DEFAULT 1 applies to every pre-existing row on ADD COLUMN.
-- ============================================================================

ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
