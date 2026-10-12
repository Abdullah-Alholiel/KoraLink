/**
 * Match pricing + POTM voting window (P2-153 hex fold, run #124).
 *
 * Domain-pure: no fetch, no socket, no adapter types. These mirror the
 * server-authoritative formulas in MatchesService and are pinned by
 * test/lib/pricing.test.ts + test/lib/potm-window.test.ts.
 *
 * Extracted from lib/api-adapter.ts, which re-exports these for back-compat —
 * new code should import from here (components must never import the adapter).
 */

/** POTM voting window length — must mirror MatchesService.VOTING_WINDOW_HOURS. */
export const POTM_VOTING_WINDOW_HOURS = 24;

/** Platform margin (SAR) added per player on top of the raw pitch-cost share.
 *  MUST mirror MatchesService.PLATFORM_MARGIN_SAR — pinned by test/lib/pricing.test.ts. */
export const PLATFORM_MARGIN_SAR = 5;

/** Round a SAR amount up to 2 decimal places (money-safe, never rounds down). */
export const round2 = (n: number): number => Math.ceil(n * 100) / 100;

/** Pitch cost prorated from the pitch hourly rate (mirrors the server). */
export function pitchCostForDuration(hourlyRate: number, durationMins: number): number {
  return round2(hourlyRate * durationMins / 60);
}

/** Per-player price mirroring MatchesService.calculatePricePerPlayer. */
export function pricePerPlayer(pitchCostSar: number, maxPlayers: number): number {
  if (maxPlayers < 2) return pitchCostSar;
  return round2(pitchCostSar / (maxPlayers - 1) + PLATFORM_MARGIN_SAR);
}

/** True while the POTM voting window (match end + 24h) is open. When `now`
 *  is omitted the live `Date.now()` is used (server contexts + tests); UI
 *  render paths MUST pass the hydration-safe `useNow()` value instead —
 *  a raw render-path clock SSRs a different answer than the device
 *  (Reviewer A CRITICAL, run #40; `null` = pre-mount = optimistic open,
 *  the API re-validates authoritatively on submit). */
export function isPotmVotingOpen(
  scheduledAt?: string,
  durationMins = 60,
  now?: number | null,
): boolean {
  if (!scheduledAt) return false;
  const endMs = new Date(scheduledAt).getTime() + durationMins * 60_000;
  const closesAtMs = endMs + POTM_VOTING_WINDOW_HOURS * 60 * 60_000;
  if (now === null) return true; // pre-mount: optimistic open
  return (now ?? Date.now()) < closesAtMs;
}
