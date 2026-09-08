import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
export class ResendService {
  private readonly logger = new Logger(ResendService.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      // Dev/staging parity with UnifonicService: no provider key → log only.
      this.logger.warn(
        `RESEND_API_KEY empty — logging email instead to=${to} subject="${subject}"`,
      );
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
        body: JSON.stringify({ from, to: [to], subject, html }),
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
}
