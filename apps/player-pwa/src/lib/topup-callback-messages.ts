/**
 * P2-276 (run #175) — top-up verify error-code mapping (Reviewer B run-#175 P1).
 *
 * POST /wallet/topup/verify rejects with a 409 ConflictException whose message
 * carries a stable `code:` prefix (wallet.topup.service.ts):
 *   payment_intent_mismatch / payment_not_paid / currency_mismatch /
 *   amount_mismatch
 * The fetcher surfaces that string as FetchError.message. The callback page
 * used to render one generic "no money was taken" line for EVERY failure —
 * false for amount/currency mismatches, where the card WAS charged and the
 * SAR left the player's bank. This map turns the prefix into the right
 * localized key (money-truthful copy) and falls back to the safe generic for
 * anything unrecognized (unknown/5xx/network).
 *
 * Pure module: no imports, trivially testable.
 */

/** API verify-rejection code prefixes → i18n keys under wallet.topup. */
const VERIFY_CODE_KEYS: Array<{ prefix: string; key: string }> = [
  // Charged-but-declined-by-KoraLink: the money LEFT the player's account —
  // never say "no money was taken" (bank auto-refund applies instead).
  { prefix: 'amount_mismatch', key: 'wallet.topup.callbackChargedDeclined' },
  // PR-Agent r1: the shared charged-declined copy makes NO claim about the
  // amount (a currency_mismatch charge may match the amount exactly).
  { prefix: 'currency_mismatch', key: 'wallet.topup.callbackChargedDeclined' },
  // Not charged / not ours: the safe generic "no money was taken" copy holds.
  { prefix: 'payment_intent_mismatch', key: 'wallet.topup.notPaid' },
  { prefix: 'payment_not_paid', key: 'wallet.topup.notPaid' },
];

/**
 * Map a verify error to the localized message key it should render.
 * Unknown errors fall back to the retry/auto-refund copy (callbackRetry),
 * which is truthful for network/5xx outcomes where the charge state is
 * genuinely unconfirmed.
 */
export function topupCallbackMessageKey(err: unknown): string {
  const message = ((err as { message?: string })?.message ?? '').toString();
  for (const { prefix, key } of VERIFY_CODE_KEYS) {
    if (message.startsWith(prefix)) return key;
  }
  return 'wallet.topup.callbackRetry';
}
