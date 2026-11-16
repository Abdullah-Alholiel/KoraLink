/**
 * P2-281 M-4 — plain-language lifecycle mapping for the Reports page.
 *
 * Reviewer B (run #176): the report/dispute state was chip-only — a small
 * pill ("resolved") with no plain-language line telling the player WHAT that
 * means for them (the "will I get my money back?" question). This module is
 * the pure status → i18n-key map; the page renders
 * `t(reports.lifecycle.<key>)` under each card's chip.
 *
 * Money truth (P2-276 convention): the copy reports what the lifecycle
 * means, never interprets charge/refund state — "any refund has already been
 * returned to your wallet" only on the terminal resolved state, where that
 * is true by the time the status is visible.
 *
 * Unknown statuses map to null → the page renders no line (fail-quiet, the
 * chip still shows). Type-safe callers can pass the API unions directly.
 */

export type ReportLifecycleStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type DisputeLifecycleStatus = 'opened' | 'under_review' | 'resolved' | 'rejected';

/** Reports: status → reports.lifecycle.* key (relative to the reports ns). */
export const REPORT_LIFECYCLE_KEYS: Record<ReportLifecycleStatus, string> = {
  open: 'lifecycle.open',
  reviewing: 'lifecycle.reviewing',
  resolved: 'lifecycle.resolved',
  dismissed: 'lifecycle.dismissed',
};

/**
 * Disputes are the MONEY path (no-shows, refunds) — their `resolved` state
 * carries the refund-truth line, which would be false for non-money
 * reports. Hence the 4 statuses map to 4 dispute-specific keys (only
 * `rejected` has no report twin).
 */
export const DISPUTE_LIFECYCLE_KEYS: Record<DisputeLifecycleStatus, string> = {
  opened: 'lifecycle.opened',
  under_review: 'lifecycle.underReview',
  resolved: 'lifecycle.disputeResolved',
  rejected: 'lifecycle.rejected',
};

/** Report status → lifecycle key, or null for an unknown status. */
export function reportLifecycleKey(status: string): string | null {
  return (REPORT_LIFECYCLE_KEYS as Record<string, string>)[status] ?? null;
}

/** Dispute status → lifecycle key, or null for an unknown status. */
export function disputeLifecycleKey(status: string): string | null {
  return (DISPUTE_LIFECYCLE_KEYS as Record<string, string>)[status] ?? null;
}
