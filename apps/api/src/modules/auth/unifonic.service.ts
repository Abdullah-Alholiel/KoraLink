import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { isProdLike } from '../../common/utils/env-flags';
import { deliveryUnavailable, maskPhone } from '../../common/utils/pii-safe-logging';

/**
 * Thin wrapper around the Unifonic SMS REST API.
 * Docs: https://help.unifonic.com/en/sms/sms-api
 *
 * 2026-11-16 owner P0 (VPS cutover test): the old no-credentials fallback
 * logged `Skipping SMS to ${to}: "${body}"` — the body contains the 6-digit
 * login code, so every phone-login OTP landed in the log in plain text on
 * Render prod AND the VPS prod (UNIFONIC_APP_SID empty on both), and the
 * endpoint still returned 200 so users waited forever for an SMS that never
 * came. Anyone with log access (Render, Coolify, log drains, Sentry
 * breadcrumbs) could log in as any phone number.
 *
 * New contract:
 *  - The message body is NEVER logged, at any level, in any environment.
 *  - Unconfigured + prod-like (NODE_ENV production|staging) → 503 with the
 *    stable machine code `SMS_UNAVAILABLE`; the caller stores no OTP and the
 *    user sees a localized "SMS is unavailable, use email" message.
 *  - Unconfigured + non-prod (local dev / jest) → log-only fallback so the
 *    dev flow still works; the log line carries only a masked phone.
 */
@Injectable()
export class UnifonicService {
  private readonly appSid: string;
  private readonly senderId: string;
  private readonly logger = new Logger(UnifonicService.name);

  constructor(private readonly config: ConfigService) {
    this.appSid = config.get<string>('UNIFONIC_APP_SID', '');
    this.senderId = config.get<string>('UNIFONIC_SENDER_ID', 'KoraLink');
  }

  /** True when a real send is possible: a provider App SID. */
  isConfigured(): boolean {
    return Boolean(this.appSid);
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.appSid) {
      // Never log the body — it carries the OTP code. The masked phone is
      // the only PII that may appear (PII-safe-logging house rule).
      const line = deliveryUnavailable('UNIFONIC_APP_SID', maskPhone(to));
      if (isProdLike(this.config)) {
        // Fail CLOSED in prod/staging: a "code sent" lie strands the user.
        // The controller maps this to a 503 SMS_UNAVAILABLE for the PWA.
        this.logger.error(line);
        throw new ServiceUnavailableException({
          message: 'SMS login is not available right now.',
          code: 'SMS_UNAVAILABLE',
        });
      }
      this.logger.warn(line);
      return;
    }

    await axios.post(
      'https://el.cloud.unifonic.com/rest/SMS/messages',
      new URLSearchParams({
        AppSid: this.appSid,
        SenderID: this.senderId,
        Body: body,
        Recipient: to,
        responseType: 'JSON',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
  }
}
