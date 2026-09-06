-- ============================================================================
-- KoraLink — E2E Join & Waitlist Test Pack (standardised)
-- docs/plans/e2e-waitlist-join/seed-e2e-waitlist.sql
--
-- Owner directive: capacities are NEVER hand-set. max_players = 2 x pitch size
-- (7v7 => 14), enforced by DB trigger trg_match_capacity (migration 0034).
--
-- Naming standard (kebab-case, sequential, no drift):
--   users    wl-e2e-host, wl-e2e-p01..p15
--   venue    wl-e2e-venue    pitch wl-e2e-pitch-7v7
--   matches  wl-e2e-a-full   wl-e2e-b-filling   wl-e2e-c-stale-full
--
-- Idempotent: ON CONFLICT everywhere. Re-run safe.
-- Reset before re-run (not required — idempotent, but for a clean slate):
--   DELETE FROM match_waitlist WHERE match_id LIKE 'wl-e2e-%';
--   DELETE FROM match_players  WHERE match_id LIKE 'wl-e2e-%';
--   DELETE FROM transactions   WHERE match_id LIKE 'wl-e2e-%';
--   DELETE FROM matches        WHERE id       LIKE 'wl-e2e-%';
--   DELETE FROM pitches        WHERE id       = 'wl-e2e-pitch-7v7';
--   DELETE FROM venues         WHERE id       = 'wl-e2e-venue';
--   DELETE FROM users          WHERE id LIKE 'wl-e2e-%';
-- ============================================================================

BEGIN;

-- ── 0. RESET — deterministic state (runner side effects from prior runs are
--       NOT idempotent-safe to layer over: roster/queue rows diverge). -------
DELETE FROM match_waitlist WHERE match_id LIKE 'wl-e2e-%';
DELETE FROM match_players   WHERE match_id LIKE 'wl-e2e-%';
DELETE FROM matches         WHERE id LIKE 'wl-e2e-%';
DELETE FROM pitches         WHERE id = 'wl-e2e-pitch-7v7';
DELETE FROM venues          WHERE id = 'wl-e2e-venue';
-- users last (roster/queue FKs cleared above; transactions are user-scoped
-- and never created against this pack).
DELETE FROM users           WHERE id LIKE 'wl-e2e-%';

-- ── 1. USERS ────────────────────────────────────────────────────────────────
-- 1 host + 15 joiners, generated 1:1. Valid SA mobiles +96657XXXXXXX
-- (9 digits after 966 — passes libphonenumber), prefix 57 = outside the
-- demo seed block. dev-login + IsPhoneNumber('SA') safe.
INSERT INTO users (id, phone, full_name, handle, role, home_lat, home_lng)
VALUES
  ('wl-e2e-host', '+966570000000', 'WL E2E Host', 'wl_e2e_host', 'Player', 24.7136, 46.6753),
  ('wl-e2e-p01', '+966570000001', 'WL E2E Player 01', 'wl_e2e_p01', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p02', '+966570000002', 'WL E2E Player 02', 'wl_e2e_p02', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p03', '+966570000003', 'WL E2E Player 03', 'wl_e2e_p03', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p04', '+966570000004', 'WL E2E Player 04', 'wl_e2e_p04', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p05', '+966570000005', 'WL E2E Player 05', 'wl_e2e_p05', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p06', '+966570000006', 'WL E2E Player 06', 'wl_e2e_p06', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p07', '+966570000007', 'WL E2E Player 07', 'wl_e2e_p07', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p08', '+966570000008', 'WL E2E Player 08', 'wl_e2e_p08', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p09', '+966570000009', 'WL E2E Player 09', 'wl_e2e_p09', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p10', '+966570000010', 'WL E2E Player 10', 'wl_e2e_p10', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p11', '+966570000011', 'WL E2E Player 11', 'wl_e2e_p11', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p12', '+966570000012', 'WL E2E Player 12', 'wl_e2e_p12', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p13', '+966570000013', 'WL E2E Player 13', 'wl_e2e_p13', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p14', '+966570000014', 'WL E2E Player 14', 'wl_e2e_p14', 'Player', 24.7743, 46.7386),
  ('wl-e2e-p15', '+966570000015', 'WL E2E Player 15', 'wl_e2e_p15', 'Player', 24.7743, 46.7386)
ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, full_name = EXCLUDED.full_name,
  handle = EXCLUDED.handle;

-- ── 2. VENUE + PITCH ────────────────────────────────────────────────────────
INSERT INTO venues (id, owner_id, name, city, address, is_approved, is_koralink_partner, location)
VALUES ('wl-e2e-venue', 'wl-e2e-host', 'WL E2E Arena', 'Riyadh',
        'Test venue — docs/plans/e2e-waitlist-join', true, true,
        ST_GeographyFromText('POINT(46.6753 24.7136)'))
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO pitches (id, venue_id, name, size, surface_type, environment, hourly_rate)
VALUES ('wl-e2e-pitch-7v7', 'wl-e2e-venue', 'WL E2E Pitch 7v7',
        '7v7', 'Grass', 'Indoor', 900.00)
ON CONFLICT (id) DO UPDATE SET size = EXCLUDED.size;

-- ── 3. MATCHES — capacity DERIVED from pitch size (never hand-set) ─────────
-- All three on the SAME 7v7 pitch: capacity = 2 x 7 = 14.
--   A  wl-e2e-a-full        14/14 after runner fills 6 seats — THE queue subject
--   B  wl-e2e-b-filling     8/14 — fill/leave/promote + host-cancel control
--   C  wl-e2e-c-stale-full  stale 'Full' at 8/14 — API auto-reverts to Open
--
-- Roster parity per TeamLineup standard: sides always equal.

INSERT INTO matches (id, host_id, pitch_id, title, match_type, gender_rule,
                     status, scheduled_at, duration_mins, price_per_player,
                     pitch_cost_sar, max_players, min_players, location, booking_mode)
SELECT 'wl-e2e-a-full', 'wl-e2e-host', 'wl-e2e-pitch-7v7',
       'WL E2E A — FULL 14/14 (7v7)', 'Competitive', 'Mixed',
       'Open', now() + interval '26 hours', 90, 25.00, 900.00,
       CASE p.size WHEN '5v5' THEN 10 WHEN '7v7' THEN 14 WHEN '8v8' THEN 16 WHEN '11v11' THEN 22 END,
       10,
       ST_GeographyFromText('POINT(46.6753 24.7136)'), 'koralink'
FROM pitches p WHERE p.id = 'wl-e2e-pitch-7v7'
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, max_players = EXCLUDED.max_players;

-- Match A roster: host + p01..p07 — 4 Home / 4 Away; runner joins p09..p14 to 7v7 parity at 14/14.
INSERT INTO match_players (id, match_id, user_id, team, is_host, no_show)
VALUES
  (gen_random_uuid()::text, 'wl-e2e-a-full', 'wl-e2e-host', 'Home', true, false),
  (gen_random_uuid()::text, 'wl-e2e-a-full', 'wl-e2e-p01', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-a-full', 'wl-e2e-p02', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-a-full', 'wl-e2e-p03', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-a-full', 'wl-e2e-p04', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-a-full', 'wl-e2e-p05', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-a-full', 'wl-e2e-p06', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-a-full', 'wl-e2e-p07', 'Away', false, false)
ON CONFLICT DO NOTHING;

INSERT INTO matches (id, host_id, pitch_id, title, match_type, gender_rule,
                     status, scheduled_at, duration_mins, price_per_player,
                     pitch_cost_sar, max_players, min_players, location, booking_mode)
SELECT 'wl-e2e-b-filling', 'wl-e2e-host', 'wl-e2e-pitch-7v7',
       'WL E2E B — FILLING 8/14 (7v7)', 'Casual', 'Mixed',
       'Open', now() + interval '30 hours', 90, 25.00, 900.00,
       CASE p.size WHEN '5v5' THEN 10 WHEN '7v7' THEN 14 WHEN '8v8' THEN 16 WHEN '11v11' THEN 22 END,
       10,
       ST_GeographyFromText('POINT(46.6753 24.7136)'), 'koralink'
FROM pitches p WHERE p.id = 'wl-e2e-pitch-7v7'
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, max_players = EXCLUDED.max_players;

-- Match B roster: host + p08..p14 — 4/4; runner fills to 14, then leave/cancel paths.
INSERT INTO match_players (id, match_id, user_id, team, is_host, no_show)
VALUES
  (gen_random_uuid()::text, 'wl-e2e-b-filling', 'wl-e2e-host', 'Home', true, false),
  (gen_random_uuid()::text, 'wl-e2e-b-filling', 'wl-e2e-p08', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-b-filling', 'wl-e2e-p09', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-b-filling', 'wl-e2e-p10', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-b-filling', 'wl-e2e-p11', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-b-filling', 'wl-e2e-p12', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-b-filling', 'wl-e2e-p13', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-b-filling', 'wl-e2e-p14', 'Away', false, false)
ON CONFLICT DO NOTHING;

INSERT INTO matches (id, host_id, pitch_id, title, match_type, gender_rule,
                     status, scheduled_at, duration_mins, price_per_player,
                     pitch_cost_sar, max_players, min_players, location, booking_mode)
SELECT 'wl-e2e-c-stale-full', 'wl-e2e-host', 'wl-e2e-pitch-7v7',
       'WL E2E C — STALE FULL 8/14 (7v7)', 'Competitive', 'Mixed',
       'Full', now() + interval '34 hours', 90, 25.00, 900.00,
       CASE p.size WHEN '5v5' THEN 10 WHEN '7v7' THEN 14 WHEN '8v8' THEN 16 WHEN '11v11' THEN 22 END,
       10,
       ST_GeographyFromText('POINT(46.6753 24.7136)'), 'koralink'
FROM pitches p WHERE p.id = 'wl-e2e-pitch-7v7'
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, max_players = EXCLUDED.max_players;

-- Match C roster: host + p01..p07 (4/4) — same shape as A.
INSERT INTO match_players (id, match_id, user_id, team, is_host, no_show)
VALUES
  (gen_random_uuid()::text, 'wl-e2e-c-stale-full', 'wl-e2e-host', 'Home', true, false),
  (gen_random_uuid()::text, 'wl-e2e-c-stale-full', 'wl-e2e-p01', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-c-stale-full', 'wl-e2e-p02', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-c-stale-full', 'wl-e2e-p03', 'Home', false, false),
  (gen_random_uuid()::text, 'wl-e2e-c-stale-full', 'wl-e2e-p04', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-c-stale-full', 'wl-e2e-p05', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-c-stale-full', 'wl-e2e-p06', 'Away', false, false),
  (gen_random_uuid()::text, 'wl-e2e-c-stale-full', 'wl-e2e-p07', 'Away', false, false)
ON CONFLICT DO NOTHING;

-- ── 4. SEED WAITLISTS ───────────────────────────────────────────────────────
-- A: p08,p09,p10 queued (1..3) — the promotion ladder.
-- B: p01,p02 queued — B's queue is cleared by the host-cancel step (by design).
-- C: none — join must succeed after the stale-Full revert.
INSERT INTO match_waitlist (id, match_id, user_id, position)
SELECT gen_random_uuid()::text, v.match_id, v.user_id, v.position
FROM (VALUES
  ('wl-e2e-a-full', 'wl-e2e-p08', 1),
  ('wl-e2e-a-full', 'wl-e2e-p09', 2),
  ('wl-e2e-a-full', 'wl-e2e-p10', 3),
  ('wl-e2e-b-filling', 'wl-e2e-p01', 1),
  ('wl-e2e-b-filling', 'wl-e2e-p02', 2)
) AS v(match_id, user_id, position)
WHERE NOT EXISTS (
  SELECT 1 FROM match_waitlist w
  WHERE w.match_id = v.match_id AND w.user_id = v.user_id
);
-- NOTE: ON CONFLICT cannot target the DEFERRABLE unique index on
-- match_waitlist (Postgres forbids deferrable arbiters) — hence NOT EXISTS.

COMMIT;

-- ── 5. SELF-VERIFICATION (fails loudly on drift) ────────────────────────────
DO $$
DECLARE
  bad_capacity int;
  bad_pos      int;
  a_total      int; a_home int; a_away int;
BEGIN
  -- Capacity invariant on every pack match: max_players = 2 x pitch size.
  SELECT count(*) INTO bad_capacity FROM matches m
  JOIN pitches p ON p.id = m.pitch_id
  WHERE m.id LIKE 'wl-e2e-%'
    AND m.max_players <> CASE p.size WHEN '5v5' THEN 10 WHEN '7v7' THEN 14
                        WHEN '8v8' THEN 16 WHEN '11v11' THEN 22 END;
  IF bad_capacity <> 0 THEN
    RAISE EXCEPTION 'CAPACITY DRIFT: % pack matches violate 2x pitch size', bad_capacity;
  END IF;

  -- Match A seeds at 8 (4 Home / 4 Away); runner completes 7v7 parity at 14/14.
  SELECT count(*), count(*) FILTER (WHERE team = 'Home'), count(*) FILTER (WHERE team = 'Away')
    INTO a_total, a_home, a_away
  FROM match_players WHERE match_id = 'wl-e2e-a-full';
  IF a_total <> 8 OR a_home <> 4 OR a_away <> 4 THEN
    RAISE EXCEPTION 'PARITY DRIFT: match A seeds at 8 (4/4), got % (%/%).', a_total, a_home, a_away;
  END IF;

  -- Queue positions dense from 1.
  SELECT count(*) INTO bad_pos FROM (
    SELECT position, row_number() OVER (PARTITION BY match_id ORDER BY position) rn
    FROM match_waitlist WHERE match_id LIKE 'wl-e2e-%'
  ) q WHERE position <> rn;
  IF bad_pos <> 0 THEN
    RAISE EXCEPTION 'POSITION DRIFT: waitlist positions not dense from 1';
  END IF;
END $$;

