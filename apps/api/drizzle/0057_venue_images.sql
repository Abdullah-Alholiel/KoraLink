-- 0057: venues.images — venue photo paths (P1-38 first leg, run #170).
-- jsonb array of media paths ("/media/venues/<venueId>/<sha256>.<ext>") served
-- by the public GET /media/venues/:key route; uploaded via POST /media/venues
-- (auth, owner-or-admin, ≤5MB jpeg/png/webp). jsonb (not text[]) to mirror the
-- amenities/images convention already used by pitches.images + venues.amenities.
ALTER TABLE "venues" ADD COLUMN "images" "jsonb" NOT NULL DEFAULT '[]'::jsonb;
