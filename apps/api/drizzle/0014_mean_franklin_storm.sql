-- P1-3: chat idempotency + keyset pagination indexes.
-- NOTE: drizzle-kit also emitted `ALTER TYPE "ActivityVerb" ADD VALUE …` here
-- because 0014_admin_notification_verbs.sql (which contains them) was applied
-- to the live DB out-of-band and never registered in meta/_journal.json. Those
-- statements were REMOVED from this file — the live DB already has the labels
-- and ADD VALUE is not idempotent (PG error 42710). The 0014 snapshot records
-- the enum state, so fresh journal-tracked generations diff correctly. Fresh-DB
-- bootstrap still needs 0014_admin_notification_verbs.sql applied manually
-- (tracked as drift debt on the board).
DROP INDEX "match_messages_match_idx";--> statement-breakpoint
CREATE INDEX "match_messages_match_created_idx" ON "match_messages" USING btree ("match_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_messages_client_msg_uidx" ON "match_messages" USING btree ("user_id","match_id","client_message_id") WHERE client_message_id IS NOT NULL;
