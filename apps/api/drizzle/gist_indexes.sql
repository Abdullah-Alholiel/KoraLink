-- PostGIS GiST indexes for geography(Point, 4326) columns.
--
-- Drizzle Kit cannot auto-generate GiST indexes from the TypeScript schema,
-- so this file must be applied manually or as part of the initial migration.
--
-- Run once on every new database:
--   psql $DATABASE_URL -f drizzle/gist_indexes.sql
-- Or apply via Drizzle Kit after running `npm run db:generate`:
--   append this SQL to the generated migration file before running
--   `npm run db:migrate`.
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
