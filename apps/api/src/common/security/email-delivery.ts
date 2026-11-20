import { ConfigService } from '@nestjs/config';

import { isProdLike } from '../utils/env-flags';

// ─────────────────────────────────────────────────────────────────────────────
// D-20261119-02 (Life-OS worker request, run #218): production-like runtimes
// must FAIL LOUD at boot when transactional email cannot actually deliver.
//
// Why: both adapters self-disable (log-only dev mode) when their key is unset,
// and EMAIL_SENDER_PROVIDER silently defaults to `resend` when EMAIL_PROVIDER
// is unset. A prod env that forgets the provider name — or its API key — boots
// green and sends NOTHING: OTP emails vanish with zero signal, locking every
// new user out. This guard reuses the EXACT env names each adapter's
// `isConfigured()` checks (Brevo: API key + verified sender; Resend: API key),
// so the two can never drift — one source of truth per transport.
//
// Posture: isProdLike (production OR staging) — the delivery fail-closed
// pattern from env-flags.ts (2026-11-16 owner P0): staging is a public funnel
// (":10000" + ":8443") where silent OTP loss is a real user-facing outage, not
// a laptop tolerable behavior. Local dev keeps the log-only dev mode by design.
// ─────────────────────────────────────────────────────────────────────────────

/** Env names each transport REQUIRES to deliver — mirrors the adapters' own `isConfigured()`. */
const REQUIRED_BY_PROVIDER: Record<string, string[]> = {
  brevo: ['BREVO_API_KEY', 'BREVO_FROM'],
  resend: ['RESEND_API_KEY'],
};

/**
 * Throws at boot when a prod-like runtime cannot deliver transactional email.
 * Call AFTER assertEnvFlags in the bootstrap chain (before app.listen).
 */
export function assertEmailDelivery(config: ConfigService): void {
  if (!isProdLike(config)) return;

  // Same normalization as EMAIL_SENDER_PROVIDER's factory — parity by construction.
  const provider = (config.get<string>('EMAIL_PROVIDER') || 'resend')
    .trim()
    .toLowerCase();

  const required = REQUIRED_BY_PROVIDER[provider];
  if (!required) {
    throw new Error(
      `EMAIL_PROVIDER=${provider} is not a known transport (brevo | resend) — transactional email (OTP) would silently send nothing`,
    );
  }

  const missing = required.filter((name) => !config.get<string>(name));
  if (missing.length > 0) {
    throw new Error(
      `EMAIL_PROVIDER=${provider} in a production-like runtime is missing required env: ${missing.join(', ')} — transactional email (OTP) would silently send nothing`,
    );
  }
}
