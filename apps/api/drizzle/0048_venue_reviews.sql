-- drizzle/0048_venue_reviews.sql
-- ============================================================================
-- Migration 0048: venue_reviews table + venues aggregate columns (P1-55)
--
-- Booking-verified venue reviews (run #117). Shape decisions:
--   * UNIQUE (venue_id, user_id) — one review per user per venue; re-submit
--     UPSERTs, so the row always carries the player's latest verdict.
--   * match_id is a PROOF ID (the verified Completed booking the review
--     derives from) WITHOUT a foreign key — match purge/cancel flows must
--     never cascade-delete historical reviews (P2-47 decision pending).
--   * rating CHECK (1..5) lives here (drizzle has no CHECK API).
--   * venues: the dead `rating` column (never written anywhere in the codebase
--     — grep-verified run #117) is replaced by tx-maintained aggregates
--     rating_avg / rating_count, recomputed inside the submit transaction.
--
-- Hand-written per the 0030+ convention (db:generate is broken on this tree —
-- drizzle-kit 0.45.2 deferred upgrade): journal entry rides the same commit,
-- snapshot copied from 0047 per the raw-SQL contract.
-- ============================================================================

CREATE TABLE IF NOT EXISTS venue_reviews (
  id varchar(36) PRIMARY KEY,
  venue_id varchar(36) NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id varchar(36) NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment varchar(500),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS venue_reviews_venue_user_idx
  ON venue_reviews (venue_id, user_id);

CREATE INDEX IF NOT EXISTS venue_reviews_venue_updated_idx
  ON venue_reviews (venue_id, updated_at);

ALTER TABLE venues DROP COLUMN IF EXISTS rating;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS rating_avg double precision NOT NULL DEFAULT 0;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;
