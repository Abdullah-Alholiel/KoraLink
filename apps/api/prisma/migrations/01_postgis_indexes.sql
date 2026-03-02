-- Migration: 01_postgis_indexes
-- Creates the PostGIS extension and GiST spatial indexes for geography columns.
-- Run ONCE against a fresh database before any application migrations.

-- Enable PostGIS extension (requires superuser or rds_superuser on AWS RDS / OCI)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────────────────────
-- GiST index on venues.location
-- Used by ST_DWithin / ST_Distance queries when searching nearby venues.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_venues_location_gist
  ON venues
  USING GIST (location);

-- ─────────────────────────────────────────────────────────────────────────────
-- GiST index on matches.location
-- Used by the discovery feed ST_DWithin geo-filter.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_matches_location_gist
  ON matches
  USING GIST (location);

-- ─────────────────────────────────────────────────────────────────────────────
-- Composite B-Tree index: status + scheduled_at for the discovery feed
-- Covers the common WHERE status = 'Open' AND scheduled_at >= NOW() filter.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_matches_status_scheduled
  ON matches (status, scheduled_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- B-Tree index on match_messages.match_id (already declared in Prisma schema,
-- added here explicitly for documentation and to ensure it exists before
-- heavy chat workloads begin).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_match_messages_match_id
  ON match_messages (match_id);
