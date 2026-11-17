import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';

/**
 * Cloudflare Turnstile server-side verification (launch-lane F1).
 *
 * Why: by the A6 gate (public URLs open), the OTP send endpoints are the
 * biggest SMS-balance exposure. Route/IP/phone caps (P2-19) bound per-client
 * rates but a distributed pump stays under every cap. A human-proof token
 * closes that class. Chosen over hCaptcha: no account needed to integrate —
 * Cloudflare publishes official dummy site/secret key pairs for development
 * and CI (always-pass / always-block), so the full gate ships and E2E-proves
 * on staging WITHOUT owner keys; swapping to real keys at A6 is env-only.
 *
 * Flag: TURNSTILE_ENABLED (default false — zero behavior change until the
 * owner flips it; D-20261113-26 authorizes the build, the flag flip stays a
 * documented default awaiting the 48h veto window).
 *
 * Contract: verify() RESOLVES {success:true} or THROWS BadRequestException
 * with a stable `code` (CAPTCHA_REQUIRED / CAPTCHA_INVALID /
 * CAPTCHA_UNAVAILABLE). NEVER falsifies success — fail-closed on any
 * verification uncertainty (owner-call documented in run212 00-retro §Risks;
 * veto = flip TURNSTILE_ENABLED=false, one env line).
 */
@Injectable()
export class TurnstileService {
  private static readonly VERIFY_URL =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  /** Official Cloudflare DUMMY secret keys (public test suite, docs.cloudflare.com). */
  private static readonly DUMMY_SECRETS = new Set([
    '1x0000000000000000000000000000000AA', // always passes
    '2x0000000000000000000000000000000AA', // always blocks
    '3x0000000000000000000000000000000AA', // yields a token timeout error
  ]);

  private readonly logger = new Logger(TurnstileService.name);
  private readonly enabled: boolean;
  private readonly secretKey: string;

  constructor(config: ConfigService) {
    this.enabled =
      (config.get<string>('TURNSTILE_ENABLED', 'false') ?? 'false')
        .trim()
        .toLowerCase() === 'true';
    this.secretKey = config.get<string>('TURNSTILE_SECRET_KEY', '') ?? '';
    if (this.enabled && !this.secretKey) {
      // Fail-loud at boot: an enabled-but-unkeyed deployment would 500 every
      // login (CAPTCHA_UNAVAILABLE) — surface it where ops looks first.
      this.logger.error(
        'TURNSTILE_ENABLED=true but TURNSTILE_SECRET_KEY missing — every captcha-gated request will fail closed (CAPTCHA_UNAVAILABLE)',
      );
      Sentry.captureMessage('Turnstile enabled without secret key', {
        level: 'warning',
        tags: { component: 'turnstile', misconfig: 'no-secret' },
      });
    }
  }

  /** Enablement + widget site key for the health contract. */
  getStatus(): { enabled: boolean; siteKey: string | null } {
    const siteKey = this.enabled
      ? (process.env.TURNSTILE_SITE_KEY ??
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
        null)
      : null;
    return { enabled: this.enabled, siteKey };
  }

  /**
   * Verify one Turnstile token. Resolves ONLY on verified success; every
   * other path throws a coded BadRequestException (see class doc).
   * @param token  client widget token (cf-turnstile-response)
   * @param ip     optional caller IP (CF recommends forwarding; improves scoring)
   */
  async verify(token: string | undefined | null, ip?: string): Promise<void> {
    if (!this.enabled) {
      return; // flag off: gate not armed — zero behavior change
    }
    if (!token || typeof token !== 'string' || token.length === 0) {
      throw this.coded('CAPTCHA_REQUIRED', 'Human verification required.');
    }

    // Official dummy secrets short-circuit — no network call, deterministic
    // staging/CI behavior. '2x…AA' (always-block) still goes through the FULL
    // path below so staging can probe the real 400 CAPTCHA_INVALID shape.
    if (
      TurnstileService.DUMMY_SECRETS.has(this.secretKey) &&
      this.secretKey.startsWith('1x')
    ) {
      this.logger.warn('turnstile: dummy always-pass secret in use — verification BYPASSED (dev/test only)');
      return;
    }

    let res: Response;
    try {
      res = await fetch(TurnstileService.VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: this.secretKey, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      this.logger.warn(
        `turnstile: verify unreachable — failing CLOSED (${(err as Error).message})`,
      );
      Sentry.captureException(err, { tags: { component: 'turnstile', stage: 'network' } });
      throw this.coded(
        'CAPTCHA_UNAVAILABLE',
        'Verification service is unreachable — please try again shortly.',
      );
    }
    if (!res.ok) {
      this.logger.warn(`turnstile: siteverify HTTP ${res.status} — failing CLOSED`);
      throw this.coded(
        'CAPTCHA_UNAVAILABLE',
        'Verification service is unavailable — please try again shortly.',
      );
    }

    let payload: { success?: boolean; 'error-codes'?: string[] };
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      throw this.coded(
        'CAPTCHA_UNAVAILABLE',
        'Verification service returned an invalid response.',
      );
    }
    if (payload.success !== true) {
      const codes = Array.isArray(payload['error-codes']) ? payload['error-codes'] : [];
      this.logger.warn(`turnstile: rejected (codes: ${codes.join(',') || 'none'})`);
      Sentry.addBreadcrumb({
        category: 'turnstile',
        message: `verify rejected: ${codes.join(',') || 'none'}`,
        level: 'warning',
      });
      throw this.coded('CAPTCHA_INVALID', 'Verification failed — please try again.');
    }
  }

  private coded(code: string, message: string): BadRequestException {
    return new BadRequestException({ message, code });
  }
}
