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
