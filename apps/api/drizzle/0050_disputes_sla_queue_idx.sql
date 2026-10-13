-- ============================================================================
-- Migration 0050: disputes_sla_queue_idx — P2-179 (run #127)
--
-- Partial composite index for the SLA sweep + admin open-queue predicate
-- (disputes.scheduler.ts + admin/disputes.service.ts list): rows that are
-- still open AND not yet SLA-escalated, ordered/scanned by updated_at.
-- Only disputes_status_idx (single-column) existed before -> seq scan + filter
-- over the full dispute history as the queue grows.
--
-- Hand-written raw-SQL-only migration (0047/0049 convention): no schema.ts
-- table declaration; snapshot copied from 0049 with fresh id + prevId chain
-- (run-#39/#103 journal contract; 8 tripwire suites must pass before push).
-- Idempotent (IF NOT EXISTS) per the 0043+ convention.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "disputes_sla_queue_idx" ON "disputes" ("updated_at") WHERE "status" IN ('opened','under_review') AND "sla_escalated" = false;
