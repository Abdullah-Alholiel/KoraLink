-- 0061: launch-condition-6 money rules (run #225, P2-398)
-- matches.pitch_forfeited_sar: stamped by cancelMatch when a host cancels a
-- paid koralink booking inside 12h of a not-yet-started match (D-20261115-04).
-- Settlement counts this column for Cancelled matches so the venue is paid
-- through the normal settlement rail. NULL = no forfeit (pre-migration rows).
ALTER TABLE "matches" ADD COLUMN "pitch_forfeited_sar" numeric(10,2);

-- match_players.no_show_karma_applied: the karma amount ACTUALLY applied by
-- this episode's no-show mark (clamped by the karma floor at mark time). The
-- un-mark reverses THIS amount, not a constant — keeps mark/un-mark symmetric
-- for players sitting at the karma floor (D-20261113-10). NULL = no mark, or
-- the mark was cleared. Legacy rows (marked pre-column) fall back to the
-- constant on un-mark.
ALTER TABLE "match_players" ADD COLUMN "no_show_karma_applied" integer;
