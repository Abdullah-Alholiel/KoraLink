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

/**
 * P0-2 (2026-11-13, owner-blocked): the Moyasar form library + stylesheet are
 * SELF-HOSTED from public/vendor/moyasar/ (npm moyasar-payment-form@2.3.0).
 * The sheet used to load only the jsDelivr script while the page CSP is
 * `style-src 'self'` — the CDN stylesheet could never load, so the form
 * rendered unstyled: bare pink error block, invisible pay button. Same-origin
 * keeps the CSP tight (no CDN wildcard); SRI pins the exact vendor bytes.
 * Provenance + patch notes: public/vendor/moyasar/README.md. Update these
 * digests together with the files on any version bump.
 */
export const MOYASAR_SCRIPT_URL = '/vendor/moyasar/moyasar.umd.js';
export const MOYASAR_SCRIPT_INTEGRITY = 'sha256-lUbbHA18dcGW3xhlgM+305yazbG8yB4XsnYy4B6gPFU=';
export const MOYASAR_CSS_URL = '/vendor/moyasar/moyasar.css';
export const MOYASAR_CSS_INTEGRITY = 'sha256-IOZojxj9UGrlzz//7qpn8sxtlqQrUd/05plyPAG0M6Q=';
