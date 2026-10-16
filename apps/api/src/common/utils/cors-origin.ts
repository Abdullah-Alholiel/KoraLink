/**
 * P2-201 (run #131): CORS origin-allowlist helpers.
 *
 * - `normalizeOrigin` strips trailing slashes so a PLAYER_URL/ADMIN_URL
 *   misconfigured with a trailing `/` doesn't silently 500 every
 *   cross-origin call (the old exact string match).
 * - `originAllowed` keeps the non-browser pass-through (no Origin header —
 *   curl, health checks, native apps) and compares normalized on BOTH sides.
 */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function originAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  // Non-browser request (curl, health check, native app) — pass through.
  if (!origin) return true;
  const candidate = normalizeOrigin(origin);
  return allowedOrigins.some((a) => normalizeOrigin(a) === candidate);
}

/**
 * P2-110 (run #137): classify a DENIED origin as scanner/probe noise.
 *
 * Sentry's express middleware instrumentation captures the HttpException the
 * CORS deny throws (mechanism `generic, handled: true`) BEFORE the
 * AllExceptionsFilter's >=500-only rule can filter it — probe rejections became
 * the loudest "error" in the project (130 events/24h, issue KORALINK-API-B).
 * The deny itself MUST keep throwing (P2-201: a silent `callback(null, false)`
 * lets the request execute routes with side effects), so the telemetry drop is
 * done by CLASSIFYING the origin at deny time: probe-shaped origins get a
 * distinct `CORS_PROBE_BLOCKED:` message that main.ts's beforeSend drops, while
 * any OTHER denied origin keeps the original `CORS origin not allowed:` message
 * and still reaches Sentry — a denied infra-shaped origin (Tailscale IP, LAN
 * host, real domain) means a deployment misconfiguration and is exactly the
 * signal worth keeping.
 *
 * Deliberately NARROW — a false "probe" classification would silence a real
 * incident: only RFC 2606 reserved TLDs and the well-known scanner payload
 * hosts classify as probes. No IP-literal heuristics (infra origins must stay
 * infra-shaped), no wildcard subdomain matching beyond the reserved TLDs.
 */
export function isProbeShapedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const host = normalizeOrigin(origin)
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // scheme
    .split('/')[0]
    .split(':')[0]; // port
  if (!host) return false;
  // RFC 2606 reserved TLDs: .example .test .invalid .localhost (+ .example.com
  // per RFC 2606 §3.2's "example.com/.net/.org" reservation).
  if (/\.(example|test|invalid|localhost)$/.test(host)) return true;
  if (/(^|\.)example\.(com|net|org)$/.test(host)) return true;
  // Well-known scanner payload hosts (Sentry issue KORALINK-API-B evidence).
  if (host === 'evil.com' || /(^|\.)evil\.com$/.test(host)) return true;
  if (/(^|\.)attacker(\..+)?$/.test(host)) return true;
  return false;
}
