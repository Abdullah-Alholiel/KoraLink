-- 0042_hot_fk_indexes.sql — P2-56: FK leading-column indexes (run #55)
-- Postgres does not auto-index the referencing side of a FK. Every column below is
-- an un-led FK leg (coverage audit: scripts/fk-index-report.mjs). All idempotent.
CREATE INDEX IF NOT EXISTS idx_pitch_slots_booked_match ON pitch_slots (booked_match_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_matches_booking_slot ON matches (booking_slot_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_matches_pom_winner ON matches (pom_winner_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_activities_match ON activities (match_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_feed_items_activity ON feed_items (activity_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_match_votes_voter ON match_votes (voter_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_match_votes_candidate ON match_votes (candidate_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_disputes_decided_by ON disputes (decided_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_disputes_respondent ON disputes (respondent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_dispute_messages_author ON dispute_messages (author_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_venue_verifications_reviewed_by ON venue_verifications (reviewed_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reports_resolved_by ON reports (resolved_by);
