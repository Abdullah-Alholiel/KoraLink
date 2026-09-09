-- 0039: one 1:1 conversation per user pair (profile→message race integrity)
-- Idempotent. Canonical pair_key on conversations, backfill, collapse
-- zero-message duplicates (keeps OLDEST — never deletes history), then a
-- partial unique index. If ≥2 conversations of the SAME pair both hold
-- messages, index creation fails LOUDLY → deploy stops → manual merge
-- decision (per docs/plans/profile-to-dm/02-architecture.md).

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pair_key varchar(73);

-- 1) Backfill: every 2-member conversation gets its sorted-pair key.
UPDATE conversations c
SET pair_key = sub.k
FROM (
  SELECT c2.id, MIN(u.id) || ':' || MAX(u.id) AS k
  FROM conversations c2
  JOIN conversation_participants cp ON cp.conversation_id = c2.id
  JOIN users u ON u.id = cp.user_id
  GROUP BY c2.id
  HAVING COUNT(DISTINCT cp.user_id) = 2
) sub
WHERE c.id = sub.id
  AND c.pair_key IS NULL;

-- 2) Collapse zero-message duplicates: keep the OLDEST conversation per pair.
DELETE FROM conversations c
USING conversations c2
WHERE c.pair_key = c2.pair_key
  AND c.id != c2.id
  AND (c2.created_at, c2.id) < (c.created_at, c.id)
  AND NOT EXISTS (
    SELECT 1 FROM personal_messages pm WHERE pm.conversation_id = c.id
  );

-- 3) Enforce: one conversation per pair (NULL pair_key rows — 1-member or
--    >2-member anomalies — stay outside the rule; the service never makes them).
CREATE UNIQUE INDEX IF NOT EXISTS conv_pair_unique_idx
  ON conversations (pair_key)
  WHERE pair_key IS NOT NULL;
