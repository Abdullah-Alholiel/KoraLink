-- ============================================================================
-- Migration 0046: venue favorites (P2-161, run #109).
--
-- A user can save (favorite) a venue; the clubs page offers a Favorites
-- filter pill and club cards/detail carry a heart toggle. Composite PK
-- (user_id, venue_id) makes favorite idempotent and serves the per-user
-- listing; the venue_id index serves cascade deletes + future per-venue
-- counts. Favorites are private to the user.
--
-- NOTE: hand-written migration per VPS convention (drizzle-kit broken here;
-- __drizzle_migrations bookkeeping row added by the apply step —
-- scripts/migrate-vps.mjs). All id columns are varchar(36) — ::text casts
-- only, never ::uuid.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "venue_favorites" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "venue_id" varchar(36) NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "venue_favorites_pk" PRIMARY KEY ("user_id","venue_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "venue_favorites_venue_id_idx" ON "venue_favorites" ("venue_id");
