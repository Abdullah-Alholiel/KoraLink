/**
 * Money-string primitives for wallet ledgers and 400 error messages.
 *
 * House rule (P2-4, run #41): amounts that move money or appear in user-facing
 * error copy travel as EXACT 2dp decimal STRINGS — never through a float.
 * `quantizeMoney2dp` (admin/settlements.service.ts) established the pattern
 * for aggregates; `moneyToNumber` / `centsFromMoneyString` extend it to the
 * arithmetic helpers so the cents math here is the ONLY float in the path,
 * and it is bounded to exact 2dp values.
 *
 * P2-168 (run #115): the reschedule path computed `Required`/`Available`
 * error amounts from parseFloat(wallet_balance) — cosmetically off by a fils
 * at 2dp boundaries (0.1 + 0.2 class) and inconsistent with the write path,
 * which already binds exact decimal strings into SQL.
 */

/** Parse a Postgres numeric string into a number SAFELY for exact-2dp cents
 *  math: the value is first normalized to an exact 2dp decimal string, so the
 *  float produced by `* 100` is an exact small integer (cents), never a
 *  0.30000000000000004-style approximation. Malformed shapes → 0 (matches
 *  quantizeMoney2dp's defensive fallback). */
export function moneyToNumber(raw: string | number | null | undefined): number {
  const s = quantizeMoney2dpString(raw);
  return Number(s);
}

/** Exact cents (integer) for a Postgres numeric string — exact-2dp guaranteed
 *  by the same normalization, so `Number(s) * 100` cannot drift. */
export function centsFromMoneyString(
  raw: string | number | null | undefined,
): number {
  return Math.round(moneyToNumber(raw) * 100);
}

/** Format integer cents back to the canonical 2dp decimal string. */
export function centsToMoneyString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Normalize any raw money value to an exact 2dp decimal string without
 *  routing a float through the formatting (mirrors quantizeMoney2dp). */
export function quantizeMoney2dpString(
  raw: string | number | null | undefined,
): string {
  if (typeof raw === 'string' && /^-?\d+\.\d{2}$/.test(raw)) return raw;
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}
