/**
 * Shared API constants.
 */

/**
 * Player-host responsibility (slice 4): the refund window for joiners who
 * leave a paid match. Leaving BEFORE this window (>= 12h until kickoff) always
 * refunds the joiner's fee. Leaving WITHIN the window refunds ONLY if a
 * waitlisted player backfills the freed seat (paid, atomic); otherwise the
 * fee is forfeited to the host (ToS-stated anti-abuse rule).
 *
 * 12h per the owner's cancel-window decision (kanban/DECISIONS.md
 * 2026-11-11, Life OS portal D-20261110-06: "Full refund until 12h before
 * slot, then forfeit, platform-wide"). The inside-window backfill exception
 * is the owner's earlier verbatim rule kept by default (48h-veto noted in
 * docs/plans/p2-332-refund-window-12h/00-retro.md).
 */
export const REFUND_WINDOW_HOURS = 12;
