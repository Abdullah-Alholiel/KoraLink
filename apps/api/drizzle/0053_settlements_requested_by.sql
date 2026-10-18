-- ============================================================================
-- Migration 0053: settlements_requested_by — P2-C (run #143)
--
-- Partner payout-request PROVENANCE (Reviewer B #142 residual P2-C): a
-- `pending` settlement row was indistinguishable between the partner's own
-- POST /partner/payout-requests and the admin auto-generator. `requested_by`
-- records the requesting partner actor (users.id, nullable):
--   NULL        = auto-generated (admin generator / SLA sweep) or pre-0053 row
--   SET         = partner-requested (written by requestPayout in the same tx)
-- Read-model only: pay() and the money sweep never branch on it (P0-2 /
-- DECISIONS.md stays the money authority).
-- Hand-written per the run-#35+ convention (drizzle-kit generate is not a
-- working path on this VPS): raw SQL + journal entry + prevId-linked snapshot
-- copy. FK naming mirrors drizzle's `settlements_requested_by_users_id_fk`.
-- ============================================================================

ALTER TABLE "settlements" ADD COLUMN "requested_by" varchar(36);--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
