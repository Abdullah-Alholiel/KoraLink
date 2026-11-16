import { ConfigService } from '@nestjs/config';

// ─────────────────────────────────────────────────────────────────────────────
// Explicit environment flags for security posture (P1-72, run #188)
//
// Strix run-#183 MEDIUM: cookie `secure`/`sameSite` and Swagger exposure were
// derived from `NODE_ENV === 'production'` string compares. Staging runs
// NODE_ENV=staging, so its access cookies shipped secure:false and the OpenAPI
// document was public. NODE_ENV itself is load-bearing on this VPS (turbo build
// mode), so hardening must come from EXPLICIT flags — the house posture used by
// AVATAR_UPLOAD_ENABLED / WALLET_TOPUP_ENABLED / the P0-7 opt-in flags.
//
// Contract for both helpers:
//   'true'  → force ON
//   'false' → force OFF
//   unset / any other value → legacy NODE_ENV derivation (zero-change default)
// ─────────────────────────────────────────────────────────────────────────────

/** True when auth cookies must carry `secure` (HTTPS-only). */
export function isCookieSecure(config: ConfigService): boolean {
  const explicit = config.get<string | undefined>('COOKIE_SECURE');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return config.get<string>('NODE_ENV') === 'production';
}

/** True when the OpenAPI document + Swagger UI should be served at /api/docs. */
export function isSwaggerEnabled(config: ConfigService): boolean {
  const explicit = config.get<string | undefined>('SWAGGER_ENABLED');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return config.get<string>('NODE_ENV') !== 'production';
}

// PR-Agent r1 on PR #216 (run #188): silent fallthrough on typo'd values
// (`COOKIE_SECURE=True` — capital T — would quietly keep cookies insecure) and
// no guard against COOKIE_SECURE=false in production, which would violate the
// P2-241 invariant (prod auth cookies must never ride an insecure connection).
// Fail LOUD at boot instead — same posture as assertBootstrapSecrets (P0-3).
export function assertEnvFlags(config: ConfigService): void {
  for (const name of ['COOKIE_SECURE', 'SWAGGER_ENABLED'] as const) {
    const v = config.get<string | undefined>(name);
    if (v === undefined || v === 'true' || v === 'false') continue;
    throw new Error(
      `${name}=${v} is invalid — allowed values: true | false (or unset for the legacy NODE_ENV derivation)`,
    );
  }
  if (
    config.get<string>('NODE_ENV') === 'production' &&
    isCookieSecure(config) === false
  ) {
    throw new Error(
      'COOKIE_SECURE=false is not allowed when NODE_ENV=production — auth cookies must be secure in production',
    );
  }
  // PR-Agent r2 (run #205 Reviewer A): the prod guard above was asymmetric —
  // an explicit SWAGGER_ENABLED=true silently re-exposed /api/docs in
  // production (the exact Strix run-#183 exposure this file exists to close).
  // Mirror the cookie invariant: prod boots with Swagger deliberately enabled
  // must fail loud, never silently serve the OpenAPI document.
  if (
    config.get<string>('NODE_ENV') === 'production' &&
    isSwaggerEnabled(config) === true
  ) {
    throw new Error(
      'SWAGGER_ENABLED=true is not allowed when NODE_ENV=production — the OpenAPI document must not be public in production',
    );
  }
}
