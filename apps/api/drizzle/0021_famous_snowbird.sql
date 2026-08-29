ALTER TABLE "matches" ADD COLUMN "min_players" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "last_nudge_at" timestamp with time zone;