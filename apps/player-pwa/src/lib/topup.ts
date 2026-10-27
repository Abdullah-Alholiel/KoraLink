/**
 * P0-2 (run #169) — shared top-up constants.
 *
 * The 3DS redirect boots the PWA fresh on /wallet/topup/callback; the intent
 * id pinned before the hosted form initialized rides sessionStorage under
 * INTENT (same tab survives the redirect round-trip). PAYMENT rides too so a
 * refresh mid-verify never orphan a charged payment (recovery path re-verifies
 * from these ids; cleared only after a definitive outcome).
 */
export const TOPUP_INTENT_SESSION_KEY = 'koralink:topup-intent-id';
export const TOPUP_PAYMENT_SESSION_KEY = 'koralink:topup-payment-id';
