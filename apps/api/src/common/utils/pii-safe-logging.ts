/**
 * PII-safe logging helpers (2026-11-16, owner P0: OTP codes leaked via logs).
 *
 * Incident: UnifonicService's no-credentials fallback logged the full SMS body
 * — which contains the 6-digit login code — alongside the full phone number.
 * Every phone-login code on Render prod AND the VPS prod landed in the log in
 * plain text, so anyone with log access could log in as any phone number.
 *
 * House rules enforced by this module (see also AGENTS.md §6):
 *  - An OTP code, a full message body, or any other credential NEVER appears
 *    in a log line, at any level, in any environment (prod, staging, dev).
 *  - Phone numbers are masked to their last 3 digits at most.
 *  - `assertNoSecrets` is the unit-test + boot tripwire: a log line that
 *    carries a 6-digit run or a 9-digit Saudi subscriber number fails loud.
 */

/** Last-3-digits phone mask: `+966*****678`. Safe for logs and traces. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '+966*****';
  return `+966*****${digits.slice(-3)}`;
}

/** Local-part mask for emails in logs: `ab****@gmail.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const head = email.slice(0, Math.min(2, at));
  return `${head}${'*'.repeat(Math.max(4, at - head.length))}${email.slice(at)}`;
}

/**
 * One consistent sentence for "provider not configured, delivery skipped".
 * Callers append the masked destination only. The message (which carries the
 * OTP code on the SMS/OTP paths) must NEVER be appended — enforced by
 * assertNoSecrets in specs.
 */
export function deliveryUnavailable(provider: string, maskedDestination: string): string {
  return `${provider} not configured — delivery skipped (would have gone to ${maskedDestination})`;
}

/**
 * Tripwire for specs and boot checks: true when a candidate log line carries
 * a shape that must never be logged — a 6-digit OTP run, a full Saudi
 * subscriber number, or a raw email address. Masked forms
 * (`+966*****678`, `ab****@x.com`) are fine: the asterisks break the pattern.
 */
export function assertNoSecrets(line: string): boolean {
  if (/\d{6}/.test(line)) return false;
  // 9 consecutive digits with the +966 country code — the unmasked phone.
  if (/\+966\d{9}/.test(line)) return false;
  // A bare email address (local@domain) without a mask.
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(line)) return false;
  return true;
}
