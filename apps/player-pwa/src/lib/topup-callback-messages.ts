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

/**
 * P2-379 (run #214) — the API now also carries these codes as a STABLE
 * machine field in the 409 body (`{ message, code }`, PR #262 precedent),
 * hoisted to `FetchError.code` by lib/fetcher.ts. Classification prefers the
 * code field (copy edits / stale bundles can't break it) and keeps the
 * message-prefix match ONLY as a deploy-skew fallback (an updated API serving
 * an older cached bundle).
 */

/** API verify-rejection codes → i18n keys under wallet.topup. */
const VERIFY_CODE_KEYS: Record<string, string> = {
  // P2-379 PR-Agent r1 (IMPORTANT, money-truth): topup_already_credited is
  // deliberately NOT mapped. The API throws it for a DIFFERENT payment on an
  // already-credited intent WITHOUT checking that payment's status — it may
  // be a failed/initiated duplicate ("no money was taken" would be true) or
  // a PAID duplicate charge (it would be false reassurance, and the
  // bank-auto-refund line would be wrong too — a paid duplicate needs a
  // support refund). The conditional-hedge generic (callbackRetry: "IF money
  // left your account…") is the only copy truthful for both.
  payment_intent_mismatch: 'wallet.topup.notPaid',
  payment_not_paid: 'wallet.topup.notPaid',
  // Charged-but-declined-by-KoraLink: the money LEFT the player's account —
  // never say "no money was taken" (bank auto-refund applies instead).
  amount_mismatch: 'wallet.topup.callbackChargedDeclined',
  // PR-Agent r1: the shared charged-declined copy makes NO claim about the
  // amount (a currency_mismatch charge may match the amount exactly).
  currency_mismatch: 'wallet.topup.callbackChargedDeclined',
};

/** Legacy message-prefix map (identical pairs; deploy-skew fallback only). */
const VERIFY_MESSAGE_PREFIX_KEYS: Array<{ prefix: string; key: string }> = [
  { prefix: 'amount_mismatch', key: 'wallet.topup.callbackChargedDeclined' },
  { prefix: 'currency_mismatch', key: 'wallet.topup.callbackChargedDeclined' },
  { prefix: 'payment_intent_mismatch', key: 'wallet.topup.notPaid' },
  { prefix: 'payment_not_paid', key: 'wallet.topup.notPaid' },
];

/**
 * Map a verify error to the localized message key it should render.
 * Classification order: (1) the stable `code` field (FetchError.code — exact
 * match), (2) the legacy message-prefix match (deploy-skew tolerance), then
 * (3) the retry/auto-refund generic (truthful for network/5xx outcomes where
 * the charge state is genuinely unconfirmed).
 */
export function topupCallbackMessageKey(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  // PR-Agent r2: hasOwnProperty guard — a bare record lookup is truthy for
  // inherited keys ('constructor', 'toString'), which would return a
  // function where an i18n key is expected.
  if (
    typeof code === 'string' &&
    Object.prototype.hasOwnProperty.call(VERIFY_CODE_KEYS, code)
  ) {
    return VERIFY_CODE_KEYS[code];
  }
  const message = ((err as { message?: string })?.message ?? '').toString();
  for (const { prefix, key } of VERIFY_MESSAGE_PREFIX_KEYS) {
    if (message.startsWith(prefix)) return key;
  }
  return 'wallet.topup.callbackRetry';
}
