import { BadRequestException, Logger } from '@nestjs/common';
import * as net from 'net';

/**
 * P0-8 (run #26) — push-endpoint SSRF guard.
 *
 * Web-push subscribers register a `endpoint` URL pointing at the user's push
 * service. The KoraLink API stores the URL verbatim and later fetches it via
 * `webpush.sendNotification` (which uses Node's `https.request`). Without
 * validation, a malicious client can point the endpoint at internal services
 * — cloud metadata (`169.254.169.254`), Redis, link-local addresses — and
 * the API will exfiltrate real notification payloads to the attacker.
 *
 * This module provides `assertSafePushEndpoint(endpoint, allowlist)` for use
 * at BOTH subscribe time (so the DB is always clean) AND send time (defense
 * in depth — a DB row that pre-dates the rule is still rejected before
 * web-push is invoked).
 *
 * Contract:
 *   - Must be a syntactically valid URL.
 *   - Scheme MUST be `https:`.
 *   - Port MUST be 443 (or unspecified, which Node normalises to 443 for https).
 *   - Hostname MUST be in the operator-supplied allowlist (defaults
 *     include FCM, Mozilla, Apple, Windows).
 *   - Hostname MUST NOT be a private/loopback/link-local IP literal.
 *   - URL MUST NOT contain userinfo (`user:pass@host`).
 *   - URL MUST NOT contain a fragment.
 *   - Total length ≤ 2048 chars (matches the FCM practical max).
 *
 * DNS-resolution validation is NOT done at subscribe time (we only see a
 * hostname, not an IP, until send time). At SEND time the caller should
 * resolve the hostname to its A/AAAA records and re-run the IP-class check
 * via `isPublicIp` — but that's the responsibility of `sendNotification`,
 * not this module. The subscribe-time check is the layer that defends
 * against obvious bad input; the send-time check is the layer that
 * defends against malicious DNS responses (a future hardening, see the
 * `resolveEndpointHost` helper below).
 */
const logger = new Logger('PushEndpointValidator');

/** Built-in allowlist of well-known push-provider hostnames. */
export const DEFAULT_PUSH_HOST_ALLOWLIST: ReadonlySet<string> = new Set([
  // Google FCM
  'fcm.googleapis.com',
  // Mozilla Firefox
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  // Apple Push Notification Service (web)
  'web.push.apple.com',
  'api.push.apple.com',
  'api.sandbox.push.apple.com',
  // Windows Push Notification Services
  'wns.notify.windows.com',
]);

/** Maximum allowed URL length — matches FCM's practical limit (RFC 7230). */
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;

export type PushEndpointValidationReason =
  | 'invalid-url'
  | 'must-use-https'
  | 'must-use-port-443'
  | 'host-not-allowed'
  | 'must-be-public-ip'
  | 'exceeds-length-cap'
  | 'userinfo-not-allowed'
  | 'fragment-not-allowed';

const REASON_MESSAGES: Readonly<Record<PushEndpointValidationReason, string>> = {
  'invalid-url': 'Invalid push endpoint: not a valid URL',
  'must-use-https': 'Invalid push endpoint: must use https',
  'must-use-port-443': 'Invalid push endpoint: must use port 443',
  'host-not-allowed': 'Invalid push endpoint: host not in allowlist',
  'must-be-public-ip': 'Invalid push endpoint: must be a public IP',
  'exceeds-length-cap': `Invalid push endpoint: exceeds ${PUSH_ENDPOINT_MAX_LENGTH} char length cap`,
  'userinfo-not-allowed': 'Invalid push endpoint: userinfo (user:pass@) not allowed',
  'fragment-not-allowed': 'Invalid push endpoint: fragment (#) not allowed',
};

/**
 * Returns null when the endpoint is acceptable, or a `reason` string when it
 * fails. Never throws — call `assertSafePushEndpoint` to throw instead.
 */
export function checkPushEndpoint(
  endpoint: unknown,
  allowlist: ReadonlySet<string> = DEFAULT_PUSH_HOST_ALLOWLIST,
): PushEndpointValidationReason | null {
  if (typeof endpoint !== 'string') return 'invalid-url';
  if (endpoint.length === 0) return 'invalid-url';
  if (endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) return 'exceeds-length-cap';

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return 'invalid-url';
  }

  if (url.protocol !== 'https:') return 'must-use-https';
  if (url.port && url.port !== '443') return 'must-use-port-443';
  // Node 20+ removed `URL#userinfo` — parse user:pass from the raw input
  // instead. The URL constructor already populated `username` / `password` if
  // present, so we check those.
  if (url.username || url.password) return 'userinfo-not-allowed';
  if (url.hash) return 'fragment-not-allowed';

  // Defense in depth: also check the raw substring for an `@` before the
  // path (catches edge cases the URL parser may have normalised).
  if (endpoint.includes('@') && endpoint.indexOf('@') < endpoint.indexOf('/', 8)) {
    return 'userinfo-not-allowed';
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Reject IP literals that resolve to private/loopback/link-local ranges.
  // This catches both direct subscriptions to bad IPs AND the case where
  // the allowlist accidentally contains a private-range host.
  if (net.isIP(host)) {
    if (!isPublicIp(host)) return 'must-be-public-ip';
  }

  if (!allowlist.has(host)) return 'host-not-allowed';

  return null;
}

/**
 * Throws `BadRequestException` (with the localized reason) when the endpoint
 * is unsafe. Use this in the subscribe / send paths.
 */
export function assertSafePushEndpoint(
  endpoint: unknown,
  allowlist?: ReadonlySet<string>,
): asserts endpoint is string {
  const reason = checkPushEndpoint(endpoint, allowlist);
  if (reason !== null) {
    logger.warn(`push-endpoint rejected: ${reason} endpoint=${redact(endpoint)}`);
    throw new BadRequestException(REASON_MESSAGES[reason]);
  }
}

/**
 * Test whether an IP literal (v4 or v6) is a publicly routable address.
 * Rejects loopback, link-local, private (RFC 1918 / ULA), multicast,
 * unspecified, and reserved-for-future-use ranges.
 */
export function isPublicIp(ip: string): boolean {
  // Node's `net.isIP` accepts a string and returns 0 (falsey), 4, or 6.
  const version = net.isIP(ip);
  if (version === 0) return false;

  const parts = ip.split(version === 4 ? '.' : ':');
  if (version === 4) {
    const [a, b] = parts.map((p) => parseInt(p, 10));
    if (a === 10) return false; // 10.0.0.0/8
    if (a === 127) return false; // 127.0.0.0/8 (loopback)
    if (a === 0) return false; // 0.0.0.0/8
    if (a === 169 && b === 254) return false; // 169.254.0.0/16 (link-local, includes cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 (CGN)
    if (a >= 224) return false; // 224.0.0.0/4 (multicast + reserved)
    if (a >= 240) return false; // 240.0.0.0/4 (reserved for future use)
    return true;
  }

  // IPv6
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return false; // unspecified / loopback
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false; // ULA
  if (normalized.startsWith('fe80:')) return false; // link-local
  if (normalized.startsWith('ff')) return false; // multicast
  // Embedded IPv4 (::ffff:a.b.c.d) — recurse on the IPv4 portion.
  const v4Match = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) return isPublicIp(v4Match[1]);
  return true;
}

/** Redact an endpoint URL for logs: keep scheme + first 24 chars of host+path. */
function redact(endpoint: unknown): string {
  if (typeof endpoint !== 'string') return '<non-string>';
  if (endpoint.length <= 32) return endpoint;
  return `${endpoint.slice(0, 24)}…(${endpoint.length} chars)`;
}
