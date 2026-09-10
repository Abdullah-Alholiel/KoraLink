import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailSender } from './email-sender.port';

/**
 * Brevo transactional-email adapter (no-domain email unblock cycle).
 *
 * Mirrors ResendService's contract exactly — dependency-free Node 20 global
 * fetch, log-only dev mode when the key is empty, 503 on provider rejection.
 * Brevo allows sending to ANY recipient once a single SENDER (an email
 * address, not a domain) is verified in their console, which unblocks OTP
 * delivery before KoraLink owns a domain.
 *
 * Brevo API: POST https://api.brevo.com/v3/smtp/email
 *   headers: { 'api-key': <key>, 'content-type': 'application/json' }
 *   body:    { sender: { name, email }, to: [{ email }], subject, htmlContent }
 */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Parses "KoraLink <no-reply@example.com>" into Brevo's {name, email}. */
export function parseFromAddress(from: string): { name: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, '').trim();
    return { name: name || 'KoraLink', email: match[2] };
  }
  return { name: 'KoraLink', email: from.trim() };
}

@Injectable()
export class BrevoService implements EmailSender {
  private readonly logger = new Logger(BrevoService.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, html: string, debugCode?: string): Promise<void> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      // Dev/staging parity with ResendService: no provider key → log only.
      // The OTP code rides the log line (debugCode) so staging E2E can verify
      // the full flow without a real mailbox — NEVER logged when a key is set.
      this.logger.warn(
        `BREVO_API_KEY empty — logging email instead to=${to} subject="${subject}"` +
          (debugCode ? ` code=${debugCode}` : ''),
      );
      return;
    }

    const fromRaw = this.config.get<string>('BREVO_FROM');
    if (!fromRaw) {
      // Unlike Resend, Brevo has no shared fallback sender — a verified
      // sender address is REQUIRED. Fail loudly instead of mis-sending.
      this.logger.error('BREVO_API_KEY set but BREVO_FROM missing — cannot send.');
      throw new ServiceUnavailableException('Email sender misconfigured.');
    }
    const sender = parseFromAddress(fromRaw);

    let res: Response;
    try {
      res = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender,
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });
    } catch (err) {
      this.logger.error(`Brevo request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Email provider unreachable.');
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      this.logger.error(
        `Brevo rejected send status=${res.status} to=${to} body=${body}`,
      );
      throw new ServiceUnavailableException('Email provider error.');
    }
  }
}
