/**
 * P2-289 (run #180) — shared top-up amount domain.
 *
 * ONE source of truth for preset amounts + amount validation across BOTH
 * top-up surfaces (legacy dummy sheet in wallet/page.tsx and the Moyasar
 * TopupSheet). Kills the run-#180 contract drift: the legacy sheet hardcoded
 * a SAR-10 minimum while the API's MIN_TOPUP_SAR (and thus
 * GET /wallet/topup/config → minAmount) is 5 — bounds must come from the
 * server config, never hardcoded client-side.
 *
 * Pure functions only (hex: domain-pure, no React/imports) — trivially
 * unit-testable and reusable by both sheets.
 */

/** Preset chips offered on both top-up sheets. All values are within the
 * API's MIN_TOPUP_SAR (5) / MAX_TOPUP_SAR (2000) bounds. */
export const TOPUP_QUICK_AMOUNTS: readonly number[] = [25, 50, 100, 200];

/**
 * Validate a user-entered top-up amount against the config bounds.
 *
 * @param raw    the raw input string (may be '', non-numeric, or '12.5.3')
 * @param min    server-config minimum (GET /wallet/topup/config → minAmount)
 * @param max    server-config maximum (GET /wallet/topup/config → maxAmount)
 * @returns 'ok' when the amount is a number within [min, max]; otherwise the
 *          reason it is not — callers map each reason to localized copy.
 */
export function validateTopupAmount(
    raw: string,
    min: number,
    max: number,
): 'ok' | 'empty' | 'invalid' | 'belowMin' | 'aboveMax' {
    if (raw.trim() === '') return 'empty';
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 'invalid';
    if (parsed < min) return 'belowMin';
    if (parsed > max) return 'aboveMax';
    return 'ok';
}
