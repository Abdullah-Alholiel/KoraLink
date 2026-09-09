/**
 * Shared API constants.
 */

/**
 * Player-host responsibility (slice 4): the refund window for joiners who
 * leave a paid match. Leaving BEFORE this window (>= 4h until kickoff) always
 * refunds the joiner's fee. Leaving WITHIN the window refunds ONLY if a
 * waitlisted player backfills the freed seat (paid, atomic); otherwise the
 * fee is forfeited to the host (ToS-stated anti-abuse rule).
 */
export const REFUND_WINDOW_HOURS = 4;
