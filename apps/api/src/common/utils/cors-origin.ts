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
