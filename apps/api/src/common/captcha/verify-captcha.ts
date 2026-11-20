import { BadRequestException } from '@nestjs/common';
import type { TurnstileService } from './turnstile.service';

export interface VerifyCaptchaOptions {
  /**
   * Guarantee the captcha rejection surfaces as an HTTP 400 (coded
   * `CAPTCHA_*` body). Set by the EMAIL send route, whose 202
   * anti-enumeration contract forbids any other failure shape from leaking
   * send status. Coded BadRequestExceptions from TurnstileService pass through
   * UNCHANGED (today's 400 CAPTCHA_REQUIRED / CAPTCHA_INVALID /
   * CAPTCHA_UNAVAILABLE); anything else (unreachable under the service's
   * documented contract) is normalized to 400 CAPTCHA_UNAVAILABLE so the route
   * can never answer with a non-400 captcha failure.
   *
   * Unset (SMS send route): rejections are rethrown exactly as the service
   * raised them — the shared coded-exception path.
   */
  surfaceCaptchaAs400?: boolean;
}

/**
 * P2-382 (run #219): the SINGLE captcha gate both public OTP-send routes call
 * (auth.controller.ts sendOtp + email-auth.controller.ts sendEmailOtp). Must
 * run BEFORE any counter / OTP write. Pure function taking the service as an
 * argument (no new injectable) so the two gates cannot drift — parity is
 * pinned by modules/auth/turnstile-parity.spec.ts.
 *
 * Flag off (TURNSTILE_ENABLED unset): TurnstileService.verify resolves
 * immediately — this helper is a pure passthrough, zero behavior change.
 */
export async function verifyCaptchaOrThrow(
  turnstile: TurnstileService,
  token: string | undefined,
  ip: string | undefined,
  opts: VerifyCaptchaOptions = {},
): Promise<void> {
  if (!opts.surfaceCaptchaAs400) {
    await turnstile.verify(token, ip);
    return;
  }
  try {
    await turnstile.verify(token, ip);
  } catch (err) {
    if (err instanceof BadRequestException) {
      throw err;
    }
    throw new BadRequestException({
      message: 'Verification service is unavailable — please try again shortly.',
      code: 'CAPTCHA_UNAVAILABLE',
    });
  }
}
