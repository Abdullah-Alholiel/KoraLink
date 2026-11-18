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

  /**
   * Official Cloudflare DUMMY secret keys that ALWAYS PASS (public test suite,
   * docs.cloudflare.com). Only these short-circuit verify(); the other public
   * dummies ('2x…AA' always-block, '3x…AA' token-spent) deliberately go
   * through the full siteverify path so staging can probe real reject shapes.
   * Rejected at boot when NODE_ENV=production (D-20261117-04).
   */
  private static readonly DUMMY_ALWAYS_PASS: ReadonlySet<string> = new Set([
    '1x0000000000000000000000000000000AA',
  ]);

  private readonly logger = new Logger(TurnstileService.name);
  private readonly enabled: boolean;
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
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
    // Fail-loud prod guard (D-20261117-04): a production deployment armed with
    // the public always-pass dummy secret would silently accept EVERY token —
    // the captcha gate would be decorative. Refuse to boot instead. Same
    // NODE_ENV=production predicate as assertEnvFlags (env-flags.ts); staging
    // (NODE_ENV=staging) keeps using the dummy keys by design.
    if (
      config.get<string>('NODE_ENV') === 'production' &&
      TurnstileService.DUMMY_ALWAYS_PASS.has(this.secretKey)
    ) {
      throw new Error(
        'TURNSTILE_SECRET_KEY is a public Cloudflare always-pass dummy secret — not allowed when NODE_ENV=production (every captcha token would pass). Set the real secret from the Cloudflare dashboard.',
      );
    }
  }

  /** Enablement + widget site key for the health contract. */
  getStatus(): { enabled: boolean; siteKey: string | null } {
    const siteKey = this.enabled
      ? (this.config.get<string>('TURNSTILE_SITE_KEY') ??
        this.config.get<string>('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ??
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
    if (TurnstileService.DUMMY_ALWAYS_PASS.has(this.secretKey)) {
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
