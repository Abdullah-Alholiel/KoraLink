-- ============================================================================
-- Migration 0043: min_players product-rule alignment (2026-09-18 "Ladies
-- Night went live" incident) + trigger backstop extension.
--
-- INCIDENT: rows carried stale half-size min_players (6 for a 7v7 whose
-- product rule is 12). The 0034 data fix keyed on max_players mismatch only,
-- so rows whose max was already correct kept a drifted min forever. The PWA
-- fix (same cycle) removes the client's clock-derived "Live Now" override;
-- THIS migration makes the DATA carry the true threshold everywhere:
--
--   1) One-shot data fix — re-derive min_players = GREATEST(max−2, 2) from
--      the pitch size for ACTIVE rows only (Open/Full/InProgress). Terminal
--      rows keep their historical threshold: the stranded-row sweep keys on
--      "Completed AND below min_players AND bulk-complete signature", so
--      raising a terminal row's threshold could retroactively strand a match
--      that legitimately played (false stranded row = Al-Nakheel regression
--      class). Idempotent: re-run matches zero rows.
--   2) Trigger backstop — 0034's trigger validated max_players only. The
--      function now ALSO enforces min_players = GREATEST(max−2, 2) and the
--      trigger fires on any INSERT or UPDATE touching the three columns, so
--      hand-seeded / non-API writes can never drift again. NOTE: a legacy
--      row (min_players = 0) can no longer have pitch/max/min updated without
--      conforming to the formula — read-time legacy exemption (min_players
--      = 0 disables the underfill nets) is unaffected.
--
-- NOTE: hand-written migration per VPS convention (drizzle-kit broken here;
-- __drizzle_migrations bookkeeping row added by the apply step).
-- All id columns are varchar(36) — ::text casts only, never ::uuid.
-- ============================================================================

-- ── 1) One-shot data fix: realign drifted ACTIVE rows ───────────────────────
UPDATE matches m
SET min_players = GREATEST(2 * (regexp_match(p.size::text, '^(\d+)v'))[1]::integer - 2, 2),
    updated_at  = now()
FROM pitches p
WHERE p.id = m.pitch_id
  AND m.status IN ('Open', 'Full', 'InProgress')
  AND m.min_players <> GREATEST(2 * (regexp_match(p.size::text, '^(\d+)v'))[1]::integer - 2, 2);

--> statement-breakpoint

-- ── 2) Trigger backstop: max AND min invariants, one function ───────────────
-- Supersedes the 0034 version (max checks kept byte-identical; min invariant
-- derived from the SAME per_side value so the two can never disagree).
CREATE OR REPLACE FUNCTION enforce_match_capacity() RETURNS trigger AS $$
DECLARE
  per_side integer;
  expected_min integer;
BEGIN
  SELECT (regexp_match(p.size::text, '^(\d+)v'))[1]::integer
    INTO per_side
  FROM pitches p
  WHERE p.id = NEW.pitch_id;

  IF per_side IS NULL THEN
    RAISE EXCEPTION 'pitch % not found for match %', NEW.pitch_id, NEW.id;
  END IF;

  -- max_players invariant (unchanged from 0034): capacity = 2 × per-side.
  IF NEW.max_players <> 2 * per_side THEN
    RAISE EXCEPTION 'match capacity invariant violated: max_players=% but pitch % requires %',
      NEW.max_players, NEW.pitch_id, 2 * per_side;
  END IF;

  -- min_players invariant (2026-09-18): even, max−2, floored at 2.
  expected_min := GREATEST(2 * per_side - 2, 2);
  IF NEW.min_players <> expected_min THEN
    RAISE EXCEPTION 'match min_players invariant violated: min_players=% but pitch % requires %',
      NEW.min_players, NEW.pitch_id, expected_min;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_capacity ON matches;
CREATE TRIGGER trg_match_capacity
  BEFORE INSERT OR UPDATE OF pitch_id, max_players, min_players ON matches
  FOR EACH ROW EXECUTE FUNCTION enforce_match_capacity();
