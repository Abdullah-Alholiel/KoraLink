ALTER TABLE "users" ADD COLUMN "push_muted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_hours_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_start_hour" integer DEFAULT 23 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_end_hour" integer DEFAULT 7 NOT NULL;