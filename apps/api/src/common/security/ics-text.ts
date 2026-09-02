/**
 * RFC 5545 §3.3.11 TEXT type escape.
 *
 * The .ics VEVENT properties (SUMMARY / LOCATION / DESCRIPTION) are plain
 * text but require a small set of characters to be escaped:
 *   - backslash (the escape character itself)  → `\\`
 *   - semicolon (the field separator)          → `\;`
 *   - comma (the value-list separator)         → `\,`
 *   - newline (any line break in the value)    → `\n` (literal)
 *
 * The order matters: backslash FIRST so the other escape sequences
 * are not themselves escaped twice.
 *
 * Why this exists: P1-17d (run #27). A match host who sets a title with
 * `\r\n` in it would otherwise split the VEVENT into two events, the
 * second of which carries attacker-controlled SUMMARY + alarm. Strix
 * LOW (CVSS ~3.5). The fix is a tiny pure helper applied at the
 * controller boundary; no library swap, no schema change.
 */
export function escapeIcsText(input: string): string {
  if (!input) return '';
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/[\r\n]/g, '\\n');
}
