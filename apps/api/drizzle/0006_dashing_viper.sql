ALTER TABLE "matches" ADD COLUMN "pom_winner_id" varchar(36);--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "pom_announced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_pom_winner_id_users_id_fk" FOREIGN KEY ("pom_winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;