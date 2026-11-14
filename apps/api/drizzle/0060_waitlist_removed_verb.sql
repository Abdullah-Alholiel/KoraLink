-- 0060: waitlist_removed activity verb (P2-347, run #200) — the paid-backfill
-- skip (PR #238) removes an underfunded queue head silently; this lets the
-- waitlist service record a bell activity + push so the player KNOWS they
-- left the queue and what to do (top up and re-join).
--
-- Enum-addition discipline (0059 fresh-apply trap): ADD VALUE ... IF NOT
-- EXISTS is idempotent; the new value must NOT be USED later in the same
-- migration transaction (PG "unsafe use of new value") — it isn't; no index
-- predicate or default references ActivityVerb here.
ALTER TYPE "ActivityVerb" ADD VALUE IF NOT EXISTS 'waitlist_removed';