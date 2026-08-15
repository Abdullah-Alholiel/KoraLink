ALTER TABLE "match_messages" ADD COLUMN "client_message_id" varchar(36);--> statement-breakpoint
ALTER TABLE "personal_messages" ADD COLUMN "client_message_id" varchar(36);