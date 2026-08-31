-- P1-33 completion (run #23): the run #19 fix (0026) folded back only 4 of the 7
-- ActivityVerb values carried by the orphaned 0014_admin_notification_verbs.sql.
-- The remaining 3 (account_suspended, account_banned, no_show_marked) exist in NO
-- journaled migration, so a FRESH `drizzle migrate` breaks at 0018: it does
-- ADD VALUE 'account_unbanned' BEFORE 'no_show_marked' and the neighbor value is missing.
-- Live DBs already have all values (out-of-band history) — idempotent via IF NOT EXISTS.
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'account_suspended';--> statement-breakpoint
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'account_banned';--> statement-breakpoint
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'no_show_marked';
