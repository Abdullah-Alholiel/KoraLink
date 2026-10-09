-- ============================================================================
-- Migration 0047: matches.location GiST index — journal parity (run #115)
--
-- Reviewer A (run #115, IMPORTANT): matches_location_gist_idx existed ONLY in
-- drizzle/gist_indexes.sql (docker-entrypoint-initdb.d — runs at container
-- INIT only). 0036 fixed the exact same gap for venues_location_gist_idx, but
-- the matches index was left initdb-only: a DB rebuilt from the journaled
-- migration chain alone (Neon prod, any fresh environment) silently lost the
-- ST_DWithin index on matches → sequential scan on the discovery feed as the
-- table grows.
--
-- This file is belt-and-braces: the index is IDempotent (IF NOT EXISTS) and
-- this VPS's staging DB already has it (verified live run #115:
-- `CREATE INDEX matches_location_gist_idx ON public.matches USING gist
-- (location)` in pg_indexes) — applying here is a no-op NOTICE.
--
-- postgis does NOT need creating here (same rule as 0036): matches.location
-- is geography(Point,4326) and cannot exist without the extension, so by the
-- time this file runs the extension is guaranteed present.
--
-- Drift note: the index is now defined in TWO places (gist_indexes.sql for
-- docker initdb + this journaled migration for every other path). Do not
-- edit one without the other — 0036 carries the same cross-reference.
-- ============================================================================

CREATE INDEX IF NOT EXISTS matches_location_gist_idx
  ON matches
  USING GIST (location);
