CREATE TABLE "match_votes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"match_id" varchar(36) NOT NULL,
	"voter_id" varchar(36) NOT NULL,
	"candidate_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matches_host_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matches_pitch_id_pitches_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_votes" ADD CONSTRAINT "match_votes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_votes" ADD CONSTRAINT "match_votes_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_votes" ADD CONSTRAINT "match_votes_candidate_id_users_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_votes_voter_match_idx" ON "match_votes" USING btree ("match_id","voter_id");--> statement-breakpoint
CREATE INDEX "match_votes_match_idx" ON "match_votes" USING btree ("match_id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_pitch_id_pitches_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_players_user_id_idx" ON "match_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pitches_venue_id_idx" ON "pitches" USING btree ("venue_id");