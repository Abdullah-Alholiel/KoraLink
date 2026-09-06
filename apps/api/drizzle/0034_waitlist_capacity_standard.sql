-- ============================================================================
-- Migration 0034: waitlist table + capacity invariant trigger + data fix
-- KoraLink board P1-17 (waitlist) + capacity standardisation (owner directive:
-- match capacity = 2 × pitch per-side, ALWAYS).
-- NOTE: hand-written migration per VPS convention (drizzle-kit broken here;
-- __drizzle_migrations bookkeeping row added by the apply step).
-- All id columns are varchar(36) — ::text casts only, never ::uuid.
-- ============================================================================

-- ── 1) match_waitlist table (P1-17) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_waitlist (
  id          varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  match_id    varchar(36) NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id     varchar(36) NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  position    integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS match_waitlist_match_user_idx
  ON match_waitlist (match_id, user_id);

-- Deferred so a swap/resequence inside ONE transaction can't trip the
-- constraint mid-statement (positions are dense 1..N, resequenced in tx).
CREATE UNIQUE INDEX IF NOT EXISTS match_waitlist_match_pos_idx
  ON match_waitlist (match_id, position)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS match_waitlist_user_id_idx ON match_waitlist (user_id);

-- ── 2) ActivityVerb enum: register the waitlist verb ────────────────────────
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'waitlist_promoted'
  AFTER 'match_rescheduled';

-- ── 3) Capacity invariant trigger ───────────────────────────────────────────
-- matches.max_players MUST equal 2 × per-side(pitches.size):
-- 5v5→10 · 7v7→14 · 8v8→16 · 11v11→22. Cross-table CHECK is impossible in
-- Postgres, so a trigger is the backstop; the API also derives the value.
CREATE OR REPLACE FUNCTION enforce_match_capacity() RETURNS trigger AS $$
DECLARE
  per_side integer;
BEGIN
  SELECT (regexp_match(p.size::text, '^(\d+)v'))[1]::integer
    INTO per_side
  FROM pitches p
  WHERE p.id = NEW.pitch_id;

  IF per_side IS NULL THEN
    RAISE EXCEPTION 'pitch % not found for match %', NEW.pitch_id, NEW.id;
  END IF;

  IF NEW.max_players <> 2 * per_side THEN
    RAISE EXCEPTION 'match capacity invariant violated: max_players=% but pitch % requires %',
      NEW.max_players, NEW.pitch_id, 2 * per_side;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_capacity ON matches;
CREATE TRIGGER trg_match_capacity
  BEFORE INSERT OR UPDATE OF pitch_id, max_players ON matches
  FOR EACH ROW EXECUTE FUNCTION enforce_match_capacity();

-- ── 3) One-shot data fix: align existing rows to capacity ───────────────────
-- max_players = capacity; min_players = greatest(max−2, 2) (service rule
-- minPlayersFor). UPDATE will fail loudly if any row can't be aligned —
-- which is the trigger doing its job.
UPDATE matches m
SET max_players = 2 * (regexp_match(p.size::text, '^(\d+)v'))[1]::integer,
    min_players = GREATEST(2 * (regexp_match(p.size::text, '^(\d+)v'))[1]::integer - 2, 2),
    updated_at  = now()
FROM pitches p
WHERE p.id = m.pitch_id
  AND m.max_players <> 2 * (regexp_match(p.size::text, '^(\d+)v'))[1]::integer;
