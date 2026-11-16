-- ============================================================================
-- Migration 0049: disputes.sla_escalated — P1-63 SLA sweep flag (run #118)
--
-- Default adopted run #109 (7-day reminder/escalation), clock elapsed
-- 2026-10-09 ~02:30Z, no owner veto -> built per Defaults+48h-Veto
-- (kanban/DECISIONS.md register).
--
-- The daily admin SLA sweep (disputes.scheduler.ts) sets this flag on
-- open/under_review disputes older than 7 days and appends an
-- {action:'sla_escalated'} entry to the evidence timeline. Informational
-- only: no money-path coupling, no auto-resolution.
--
-- Idempotent (IF NOT EXISTS) per the 0045-0048 hand-written convention.
-- ============================================================================

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS sla_escalated boolean NOT NULL DEFAULT false;
