/**
 * P2-185 (run #133): WS handshake origin gate — reject at upgrade time.
 *
 * The gateway decorator's `cors.origin` factory cannot read runtime config
 * (static decorator values see no DI), so it used to wave EVERY origin
 * through and the allowlist check ran post-connect in handleConnection —
 * each unlisted-origin probe still completed a full handshake+disconnect
 * cycle. `allowRequest` runs BEFORE the engine.io upgrade, so unlisted
 * browser origins are rejected at the HTTP layer with zero handshakes.
 *
 * One origin truth: `wsAllowRequest` delegates to the SAME `originAllowed`
 * helper the REST side uses (P2-201), so REST + WS can never drift on
 * normalize rules (trailing slashes, whitespace).
 */

import { originAllowed } from './cors-origin';

/**
 * Module-level provider for the live allowlist. The gateway constructor
 * (which HAS ConfigService) installs a closure over PLAYER_URL/ADMIN_URL;
 * until then it falls back to the same bootstrap defaults main.ts uses.
 */
let allowedOriginsProvider: () => string[] = () => [
  'http://localhost:3000',
  'http://localhost:3002',
];

/** Installed by AppGateway on init — wires ConfigService into the gate. */
export function setWsAllowedOriginsProvider(provider: () => string[]): void {
  allowedOriginsProvider = provider;
}

/** Test seam — resets to bootstrap defaults. */
export function resetWsAllowedOriginsProvider(): void {
  allowedOriginsProvider = () => [
    'http://localhost:3000',
    'http://localhost:3002',
  ];
}

/**
 * engine.io `allowRequest` predicate. Non-browser requests (no Origin
 * header — curl, health checks, native apps) pass through, matching the
 * REST posture and the documented P1-17c decision (native sockets carry
 * token auth, not Origin).
 */
export function wsAllowRequest(req: {
  headers?: Record<string, string | string[] | undefined>;
}): boolean {
  const raw = req.headers?.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;
  if (!origin) return true; // non-browser pass-through, regardless of provider health
  try {
    return originAllowed(origin, allowedOriginsProvider());
  } catch {
    return false; // fail-closed: unresolvable allowlist must not open the gate
  }
}

/** Server-side handshake origin extraction (header read only). */
export function extractHandshakeOrigin(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const raw = req.headers?.origin;
  return Array.isArray(raw) ? raw[0] : raw;
}
