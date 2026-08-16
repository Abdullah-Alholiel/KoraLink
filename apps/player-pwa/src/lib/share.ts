/**
 * Universal share + clipboard helpers for every browser the PWA runs in:
 * iOS Safari, installed iOS home-screen PWA (standalone), Android Chrome,
 * desktop, and — critically — NON-SECURE origins (plain HTTP over Tailscale
 * IP), where `navigator.clipboard` is undefined.
 *
 * Cascade:
 *   shareOrCopy:  navigator.share → copyToClipboard → 'failed'
 *   copyToClipboard: async Clipboard API → legacy execCommand → null
 *
 * The legacy `execCommand('copy')` path needs to run synchronously inside
 * the user gesture, so it must be reached WITHOUT awaiting anything first
 * (the async-clipboard branch below only awaits when the API exists).
 */

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed';

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

/** True when the user dismissed the native share sheet (NOT a failure). */
function isDismissal(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'AbortError' || err.name === 'NotAllowedError') &&
    // NotAllowedError with a message mentioning "dismiss" is iOS's variant;
    // a genuine permission denial stays a failure.
    (err.name === 'AbortError' || /dismiss|cancel/i.test(err.message))
  );
}

/**
 * Copy text using every mechanism available. Returns the method used, or
 * null when nothing worked (caller must surface an honest error).
 *
 * Method 1 — async Clipboard API: secure contexts only (HTTPS/localhost).
 * Method 2 — legacy textarea + execCommand: works on HTTP origins and old
 * iOS standalone PWAs; includes the iOS selection dance (contentEditable +
 * Range + setSelectionRange) because plain `.select()` selects nothing in
 * iOS WebKit.
 */
export async function copyToClipboard(text: string): Promise<'async-clipboard' | 'legacy-exec' | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  // ── Method 1: async clipboard API ──
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'async-clipboard';
    } catch {
      // Rejected (permission / not-allowed in standalone) — fall through
      // to the legacy path. The gesture may be consumed, but try anyway.
    }
  }

  // ── Method 2: legacy execCommand ──
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // Must be in the layout (not display:none) for iOS to copy it.
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '-9999px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);

  let ok = false;
  try {
    if (isIOS) {
      ta.contentEditable = 'true';
      ta.readOnly = false;
      const range = document.createRange();
      range.selectNodeContents(ta);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      ta.setSelectionRange(0, text.length);
    } else {
      ta.select();
    }
    ok = document.execCommand('copy');
    if (isIOS) window.getSelection()?.removeAllRanges();
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(ta);
  }

  return ok ? 'legacy-exec' : null;
}

/**
 * Share via the Web Share API when available; otherwise copy the payload to
 * the clipboard. Callers toast based on the outcome:
 *  - 'shared'   → native sheet showed feedback; stay quiet
 *  - 'copied'   → show "Link copied"
 *  - 'dismissed'→ user closed the native sheet; stay quiet
 *  - 'failed'   → show an honest error
 */
export async function shareOrCopy(payload: SharePayload): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (err) {
      if (isDismissal(err)) return 'dismissed';
      // Genuine failure (bad data, blocked) — fall through to copy.
    }
  }

  const text = [payload.text, payload.url].filter(Boolean).join('\n');
  if (!text) return 'failed';

  const method = await copyToClipboard(text);
  return method ? 'copied' : 'failed';
}
