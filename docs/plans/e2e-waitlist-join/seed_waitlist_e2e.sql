-- ============================================================================
-- KoraLink — E2E TEST DATA: full-match JOIN / waitlist-gap pack
-- Purpose   : end-to-end testing of the join flow at + around full capacity.
--             Board P1-17 (no waitlist/overflow) is still TODO — this pack
--             reproduces that gap E2E and provides the pre-built FULL match
--             the future waitlist feature will hang off.
-- Idempotent: safe to re-run. Deletes only its own 'e2e-%' rows first.
-- Run with  : docker exec -i koralink-postgres psql -U koralink -d koralink \
--               -v ON_ERROR_STOP=1 < docs/plans/e2e-waitlist-join/seed_waitlist_e2e.sql
-- IDs       : fixed ('e2e-…', varchar(36)-safe) so runs are reproducible.
-- ============================================================================

BEGIN;

-- ── RESET: previous pack rows only (child → parent order) ──────────────────
DELETE FROM match_players WHERE match_id LIKE 'e2e-%' OR user_id LIKE 'e2e-%';
DELETE FROM matches       WHERE id LIKE 'e2e-%';
-- transactions.user_id is FK RESTRICT (migration 0031): skip users that ever
-- had a ledger row — residue is intentional and harmless for testing.
DELETE FROM users WHERE id LIKE 'e2e-%'
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = users.id);
DELETE FROM pitches WHERE id LIKE 'e2e-%';
DELETE FROM venues  WHERE id LIKE 'e2e-%';

-- ── 1. USERS — 1 owner/host + 12 joiners ───────────────────────────────────
-- Phone range +9665700000NN sits OUTSIDE the seed range (…000001–014) so the
-- pack never collides with seeded demo users.
INSERT INTO users (id, phone, full_name, handle, skill_level, role,
                   home_lat, home_lng)
VALUES
  ('e2e-wl-owner', '+966570000000', 'E2E Host (owner)',  'e2e_wl_host',   'Advanced',     'Player', 24.7136, 46.6753),
  ('e2e-wl-u01',   '+966570000001', 'E2E Joiner 01',     'e2e_wl_u01',    'Beginner',     'Player', 24.7743, 46.7386),
  ('e2e-wl-u02',   '+966570000002', 'E2E Joiner 02',     'e2e_wl_u02',    'Intermediate', 'Player', 24.7743, 46.7386),
  ('e2e-wl-u03',   '+966570000003', 'E2E Joiner 03',     'e2e_wl_u03',    'Advanced',     'Player', 24.7743, 46.7386),
  ('e2e-wl-u04',   '+966570000004', 'E2E Joiner 04',     'e2e_wl_u04',    'Beginner',     'Player', 24.7743, 46.7386),
  ('e2e-wl-u05',   '+966570000005', 'E2E Joiner 05',     'e2e_wl_u05',    'Intermediate', 'Player', 24.7743, 46.7386),
  ('e2e-wl-u06',   '+966570000006', 'E2E Joiner 06',     'e2e_wl_u06',    'Advanced',     'Player', 24.7743, 46.7386),
  ('e2e-wl-u07',   '+966570000007', 'E2E Joiner 07',     'e2e_wl_u07',    'Beginner',     'Player', 24.7743, 46.7386),
  ('e2e-wl-u08',   '+966570000008', 'E2E Joiner 08',     'e2e_wl_u08',    'Intermediate', 'Player', 24.7743, 46.7386),
  ('e2e-wl-u09',   '+966570000009', 'E2E Joiner 09',     'e2e_wl_u09',    'Advanced',     'Player', 24.7743, 46.7386),
  ('e2e-wl-u10',   '+966570000010', 'E2E Joiner 10',     'e2e_wl_u10',    'Beginner',     'Player', 24.7743, 46.7386),
  ('e2e-wl-u11',   '+966570000011', 'E2E Joiner 11',     'e2e_wl_u11',    'Intermediate', 'Player', 24.7743, 46.7386),
  ('e2e-wl-u12',   '+966570000012', 'E2E Joiner 12',     'e2e_wl_u12',    'Advanced',     'Player', 24.7743, 46.7386)
ON CONFLICT (id) DO NOTHING;

-- ── 2. VENUE + PITCH (Riyadh, approved, partner) ───────────────────────────
INSERT INTO venues (id, owner_id, name, city, address, is_approved,
                    is_koralink_partner, location)
VALUES ('e2e-wl-venue-0001', 'e2e-wl-owner',
        'E2E Arena — Waitlist Pack', 'Riyadh',
        'Test venue — docs/plans/e2e-waitlist-join', true, true,
        ST_GeographyFromText('POINT(46.6753 24.7136)'))
ON CONFLICT (id) DO NOTHING;

INSERT INTO pitches (id, venue_id, name, size, surface_type, environment,
                     hourly_rate)
VALUES ('e2e-wl-pitch-0001', 'e2e-wl-venue-0001', 'E2E Pitch A (7v7)',
        '7v7', 'Grass', 'Indoor', 900.00)
ON CONFLICT (id) DO NOTHING;

-- ── 3. MATCH A — 'e2e-waitlist-match-0001': FULL 12/12, Open-for-join end state ──
--    THE waitlist test subject: any join attempt here is the P1-17 gap probe.
--    Roster 6 Home / 6 Away; host counts as a player (skill §2.5).
INSERT INTO matches (id, host_id, pitch_id, title, match_type, gender_rule,
                     status, scheduled_at, duration_mins, price_per_player,
                     pitch_cost_sar, max_players, min_players, location,
                     booking_mode)
VALUES ('e2e-waitlist-match-0001', 'e2e-wl-owner', 'e2e-wl-pitch-0001',
        'E2E Waitlist Pack — FULL 12/12 (7v7)', 'Competitive', 'Mixed',
        'Open', now() + interval '26 hours', 90, 25.00, 900.00,
        12, 10, ST_GeographyFromText('POINT(46.6753 24.7136)'), 'koralink')
ON CONFLICT (id) DO NOTHING;

INSERT INTO match_players (id, match_id, user_id, team, is_host, no_show)
VALUES (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-owner', 'Home', true,  false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u01',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u02',   'Home', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u03',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u04',   'Home', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u05',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u06',   'Home', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u07',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u08',   'Home', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u09',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u10',   'Home', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0001', 'e2e-wl-u11',   'Away', false, false)
ON CONFLICT DO NOTHING;

-- ── 4. MATCH B — 'e2e-waitlist-match-0002': CONTROL 5/12 (fill-to-full path) ──
--    Positive path + capacity boundary: join until the 12th player flips it
--    to Full, then verify the next joiner gets rejected.
INSERT INTO matches (id, host_id, pitch_id, title, match_type, gender_rule,
                     status, scheduled_at, duration_mins, price_per_player,
                     pitch_cost_sar, max_players, min_players, location,
                     booking_mode)
VALUES ('e2e-waitlist-match-0002', 'e2e-wl-owner', 'e2e-wl-pitch-0001',
        'E2E Waitlist Pack — CONTROL 5/12 (7v7)', 'Casual', 'Mixed',
        'Open', now() + interval '30 hours', 90, 25.00, 900.00,
        12, 10, ST_GeographyFromText('POINT(46.6753 24.7136)'), 'koralink')
ON CONFLICT (id) DO NOTHING;

INSERT INTO match_players (id, match_id, user_id, team, is_host, no_show)
VALUES (gen_random_uuid()::text, 'e2e-waitlist-match-0002', 'e2e-wl-owner', 'Home', true,  false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0002', 'e2e-wl-u03',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0002', 'e2e-wl-u05',   'Home', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0002', 'e2e-wl-u09',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0002', 'e2e-wl-u11',   'Home', false, false)
ON CONFLICT DO NOTHING;

-- ── 5. MATCH C — 'e2e-waitlist-match-0003': STALE 'Full' (6/12, 6 free) ──
--    Verifies the API's stale-Full revert: joinMatch reverts status Full→Open
--    (premise-predicated, P2-49) then admits the joiner. 6 spots actually free.
INSERT INTO matches (id, host_id, pitch_id, title, match_type, gender_rule,
                     status, scheduled_at, duration_mins, price_per_player,
                     pitch_cost_sar, max_players, min_players, location,
                     booking_mode)
VALUES ('e2e-waitlist-match-0003', 'e2e-wl-owner', 'e2e-wl-pitch-0001',
        'E2E Waitlist Pack — STALE FULL 6/12 (7v7)', 'Competitive', 'Mixed',
        'Full', now() + interval '48 hours', 90, 25.00, 900.00,
        12, 10, ST_GeographyFromText('POINT(46.6753 24.7136)'), 'koralink')
ON CONFLICT (id) DO NOTHING;

INSERT INTO match_players (id, match_id, user_id, team, is_host, no_show)
VALUES (gen_random_uuid()::text, 'e2e-waitlist-match-0003', 'e2e-wl-owner', 'Home', true,  false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0003', 'e2e-wl-u02',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0003', 'e2e-wl-u04',   'Home', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0003', 'e2e-wl-u06',   'Away', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0003', 'e2e-wl-u08',   'Home', false, false),
       (gen_random_uuid()::text, 'e2e-waitlist-match-0003', 'e2e-wl-u10',   'Away', false, false)
ON CONFLICT DO NOTHING;

-- ── 6. VERIFY (printed at end of seed run) ─────────────────────────────────
SELECT 'seed OK — matches: ' || count(*) || ' (statuses: ' ||
       string_agg(status || '=' || cnt::text, ', ' ORDER BY status) || ')'
FROM (
  SELECT status, count(*) AS cnt
  FROM matches WHERE id LIKE 'e2e-%' GROUP BY status
) s;

SELECT '   ' || m.id || '  status=' || m.status || '  players=' ||
       count(mp.id)::text || '/' || m.max_players::text AS seeded_state
FROM matches m
LEFT JOIN match_players mp ON mp.match_id = m.id
WHERE m.id LIKE 'e2e-%'
GROUP BY m.id, m.status, m.max_players
ORDER BY m.id;

COMMIT;
