-- 0041: match-chat read watermark (P2-58, run #50)
-- getMyDiscussions hardcodes unread_count = 0 for match-type rows; only
-- personal conversations counted unread. This adds the per-user, per-EPISODE
-- watermark on match_players (roster-row-scoped: leave→rejoin = fresh episode
-- = fresh watermark, mirroring fee_paid_sar convention).
-- Idempotent; safe to re-apply.

ALTER TABLE match_players
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;
