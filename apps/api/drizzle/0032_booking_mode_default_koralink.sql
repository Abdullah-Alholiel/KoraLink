-- Product decision: hosting a match must open in (and default to) the
-- "Book via Us" (koralink) mode, not "Book by Yourself". Align the DB column
-- default with the PWA form default, the create-match DTO/Swagger default,
-- and the matches.service fallback so an omitted booking_mode is consistently
-- koralink across every layer.
--
-- Metadata-only change (no table rewrite, no enum change). Existing rows are
-- untouched; the demo seed sets booking_mode explicitly per match.
ALTER TABLE "matches"
  ALTER COLUMN "booking_mode" SET DEFAULT 'koralink';
