-- Enable PostGIS extension — required for geography(Point, 4326) columns.
-- This file runs automatically when the PostgreSQL Docker container starts
-- for the first time (docker-entrypoint-initdb.d).
CREATE EXTENSION IF NOT EXISTS "postgis";

-- PostGIS GiST indexes for geography(Point, 4326) columns.
--
-- Without these indexes the ST_DWithin discovery feed query performs a
-- sequential scan, making the "Find Nearby Matches" endpoint increasingly
-- slow as the matches table grows.

CREATE INDEX IF NOT EXISTS matches_location_gist_idx
  ON matches
  USING GIST (location);

CREATE INDEX IF NOT EXISTS venues_location_gist_idx
  ON venues
  USING GIST (location);
