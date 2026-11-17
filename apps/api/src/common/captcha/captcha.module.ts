import { Module } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';

/**
 * CAPTCHA capability module (launch-lane F1). Providers the Turnstile
 * verifier for any module that must gate a bot-prone endpoint (auth OTP
 * sends today; health exposes its status). Import — never re-implement.
 */
@Module({
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class CaptchaModule {}
