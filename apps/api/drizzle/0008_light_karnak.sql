CREATE TYPE "public"."match_visibility" AS ENUM('public', 'private');--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "visibility" "match_visibility" DEFAULT 'public' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_visibility_idx" ON "matches" (visibility, status, scheduled_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_location_gist_idx" ON "matches" USING gist (location);