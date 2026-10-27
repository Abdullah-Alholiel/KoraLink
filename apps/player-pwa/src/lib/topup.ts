/**
 * P0-2 (run #169) — shared top-up constants.
 *
 * The 3DS redirect boots the PWA fresh on /wallet/topup/callback; the intent
 * id pinned before the hosted form initialized rides sessionStorage under
 * this key (same tab survives the redirect round-trip).
 */
export const TOPUP_INTENT_SESSION_KEY = 'koralink:topup-intent-id';
