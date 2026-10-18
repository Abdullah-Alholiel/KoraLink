-- ============================================================================
-- Migration 0052: activity_verb_payout_paid — P1-67 (run #142)
--
-- Appends 'payout_paid' to the ActivityVerb enum. Companion to PR #146
-- (lane/run141-p1-67): settlements.service pay() records a payout_paid
-- activity + partner bell/push after the guarded paid-state update. The enum
-- value MUST exist before the first real payout notification insert, so this
-- migration rides the SAME squash as the code (run-#1 half-slice rule).
--
-- Hand-written raw-SQL-only migration (0047/0049/0050/0051 convention):
-- snapshot copied from 0051 with fresh id + prevId chain (run-#39/#103
-- journal contract; tripwire suites must pass before push). Idempotent
-- (IF NOT EXISTS). PG >= 12 allows ADD VALUE in a transaction as long as the
-- value is not used in the same transaction — this file contains only the
-- append, and the first USE happens later from the deployed service.
-- ============================================================================

ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'payout_paid';
