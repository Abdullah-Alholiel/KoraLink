import { ConfigService } from '@nestjs/config';

import { EMAIL_SENDER } from './email-sender.port';
import { ResendService } from './resend.service';
import { BrevoService } from './brevo.service';

/**
 * Selects the transactional-email transport from env:
 *
 *   EMAIL_PROVIDER=brevo  → BrevoService (works with a VERIFIED SENDER
 *                           address only — no domain needed; unblocks OTP to
 *                           any recipient before KoraLink owns a domain).
 *   anything else (default: resend) → ResendService (production path once a
 *                           sending domain is verified; `resend.dev` from-
 *                           address is owner-only).
 *
 * Both adapters implement EmailSender and share the same log-only dev mode
 * when their API key is unset, so swapping providers is env-only.
 */
export const EMAIL_SENDER_PROVIDER = {
  provide: EMAIL_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    (config.get<string>('EMAIL_PROVIDER') || 'resend').trim().toLowerCase() === 'brevo'
      ? new BrevoService(config)
      : new ResendService(config),
};
