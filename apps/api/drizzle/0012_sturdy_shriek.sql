DROP INDEX "venue_verifications_venue_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "venue_verifications_venue_idx" ON "venue_verifications" USING btree ("venue_id");