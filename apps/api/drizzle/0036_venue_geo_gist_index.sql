-- ============================================================================
-- Migration 0036: venues.location GiST index (run #39, 2026-09-07)
-- Journal-repair cycle: also the first migration applied THROUGH the repaired
-- journal (drizzle migrate()) on this VPS.
--
-- Why: gist_indexes.sql (docker-entrypoint-initdb.d) runs only at container
-- INIT. matches.location existed at init time (its GiST index was created),
-- but venues.location was added by a later migration — so the venues index
-- was never created there, and no journaled migration covered it either
-- (verified live 2026-09-07: matches_location_gist_idx present,
-- venues_location_gist_idx MISSING). venues.service findNearby filters with
-- ST_DWithin(v.location, …) → sequential scan on the venues table.
--
-- Note: postgis does NOT need creating here — the venues.location column
-- (geography) already required the extension, so by the time this file runs
-- the extension is guaranteed present. Idempotent: IF NOT EXISTS.
-- ============================================================================

CREATE INDEX IF NOT EXISTS venues_location_gist_idx
  ON venues
  USING GIST (location);
