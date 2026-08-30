-- P1-33 (run #19): fold the orphaned 0014_admin_notification_verbs.sql into the
-- journal chain. That file was applied to live DBs out-of-band (run #14) but never
-- registered, so a FRESH environment running `drizzle migrate` skipped it and missed
-- these ActivityVerb values — first dispute-resolve / refund / admin-cancel insert
-- would fail with `invalid input value for enum "ActivityVerb"`.
-- Idempotent (IF NOT EXISTS) because live DBs already have all four values.
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'dispute_resolved';--> statement-breakpoint
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'dispute_rejected';--> statement-breakpoint
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'wallet_refunded';--> statement-breakpoint
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'match_cancelled_admin';
