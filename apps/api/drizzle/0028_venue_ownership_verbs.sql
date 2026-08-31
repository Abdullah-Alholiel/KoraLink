-- Run (admin-ux-overhaul slice 4): admin venue ownership transfer. New
-- activity verbs for the old/new owner notifications. Idempotent — safe on
-- live DBs where the values may land before this migration runs.
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'venue_ownership_added';--> statement-breakpoint
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'venue_ownership_removed';
