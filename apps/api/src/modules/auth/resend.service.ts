import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailSender } from './email-sender.port';
import { deliveryUnavailable, maskEmail } from '../../common/utils/pii-safe-logging';

/**
 * Resend transactional-email client (P0-9 / email-otp-login cycle).
 *
 * Deliberately dependency-free: Node 20's global fetch hits
 * https://api.resend.com/emails directly, so no SDK enters the bundle and
 * the free-tier integration stays a single auditable file.
 *
 * Contract (docs/plans/email-otp-login/03-program-design.md):
 *   send(to, subject, html) — resolves silently (logs the payload) when
 *   RESEND_API_KEY is empty, mirroring UnifonicService's graceful dev mode.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

@Injectable()
export class ResendService implements EmailSender {
  private readonly logger = new Logger(ResendService.name);

  constructor(private readonly config: ConfigService) {}

  async send(
    to: string,
    subject: string,
    html: string,
    debugCode?: string,
    text?: string,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      // Dev fallback: no provider key → log only. The OTP code (debugCode)
      // and the message body are NEVER logged — 2026-11-16 owner P0: codes
      // in logs let anyone with log access log in as any user. Only the
      // masked destination appears.
      this.logger.warn(deliveryUnavailable('RESEND_API_KEY', maskEmail(to)));
      return;
    }

    const from =
      this.config.get<string>('RESEND_FROM') || 'KoraLink <onboarding@resend.dev>';

    let res: Response;
    try {
      res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, html, ...(text ? { text } : {}) }),
      });
    } catch (err) {
      this.logger.error(`Resend request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Email provider unreachable.');
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      this.logger.error(
        `Resend rejected send status=${res.status} to=${to} body=${body}`,
      );
      throw new ServiceUnavailableException('Email provider error.');
    }
  }

  /** True when a real send is possible: a provider API key. */
  isConfigured(): boolean {
    return Boolean(this.config.get<string>('RESEND_API_KEY'));
  }
}
