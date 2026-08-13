/**
 * Generate an RFC 4122 v4 UUID, with graceful fallbacks.
 *
 * `crypto.randomUUID()` is ONLY available in secure contexts (HTTPS or
 * localhost). KoraLink is often reached over Tailscale HTTP (e.g.
 * http://100.93.99.24:3000), which is a NON-secure context — there
 * `crypto.randomUUID` is `undefined` and calling it throws.
 *
 * Fallback chain:
 *   1. crypto.randomUUID()          — secure context, modern browser
 *   2. crypto.getRandomValues()     — available even in non-secure contexts
 *   3. Math.random()                — last resort (not cryptographically strong)
 */
export function uuid(): string {
  const c =
    typeof globalThis !== 'undefined' && 'crypto' in globalThis
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    // Set version (4) and variant (10xx) bits per RFC 4122
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Final fallback — not cryptographically strong but unique enough for
  // idempotency keys in practice.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
