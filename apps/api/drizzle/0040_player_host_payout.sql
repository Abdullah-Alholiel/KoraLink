-- 0040: Player-host responsibility & payout regulation (player-host-responsibility cycle)
-- - HostPayoutState enum: payout state machine for player-hosted fee matches
-- - matches.is_player_hosted: persisted booker distinction (labeling must not depend on a
--   runtime role JOIN — feed SQL stays cheap and history stays stable if a role changes later)
-- - matches.host_payout_state: 'held' → 'released' on completion (single-shot guarded UPDATE),
--   → 'cancelled' on cancellation; 'not_applicable' = venue-hosted / free (legacy default)
-- - matches.host_accepted_terms_at: consent persisted at createMatch (both booking modes)
-- - match_players.fee_paid_sar: per-EPISODE join fee snapshot (refund/forfeit keys derive from
--   the roster-row id — NEVER {matchId}-{userId}, which collides on a legal leave→rejoin)
-- Legacy-safe: every default keeps existing rows at zero behavior change.

DO $$ BEGIN
  CREATE TYPE "HostPayoutState" AS ENUM ('held', 'released', 'cancelled', 'not_applicable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_player_hosted boolean NOT NULL DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS host_payout_state "HostPayoutState" NOT NULL DEFAULT 'not_applicable';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS host_accepted_terms_at timestamptz;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS fee_paid_sar numeric(10,2);

CREATE INDEX IF NOT EXISTS matches_payout_state_idx ON matches (host_payout_state) WHERE host_payout_state = 'held';
