/**
 * F2 (run #223) — Moyasar webhook endpoint, flag-off by default.
 *
 * Moyasar's webhook security model (docs.moyasar.com, scraped 2026-11-22):
 * the consumer assigns a `shared_secret` when registering the webhook; every
 * event body echoes it as `secret_token`. There is NO HMAC signature header —
 * so this endpoint (1) compares the echoed secret constant-time (fail-closed),
 * then (2) NEVER trusts the event payload for money decisions: it re-fetches
 * the payment from Moyasar with the secret key and runs the exact same
 * binding/paid/SAR/amount assertions + guarded single-tx credit as
 * /wallet/topup/verify (WalletTopupService.creditFromWebhook).
 *
 * Event routing:
 * - webhook_verification: Moyasar sends it ONCE with a 6-digit code; we log it
 *   + capture to Sentry so the owner can confirm the webhook in the dashboard
 *   within the 30-min code window. Respond 2xx.
 * - payment_paid: credit path (idempotent by 'topup:<paymentId>').
 * - everything else (payment_failed/refunded/voided/authorized/captured/
 *   verified/card_auth_*): acknowledged 2xx, deliberately not acted on
 *   (no debit-back path exists in the wallet today; future row).
 *
 * Moyasar retries a webhook 5× when it doesn't get a 2xx — so ANY event we
 * have decided not to act on must still return 2xx to avoid retry storms,
 * while transport-level auth failures (bad secret) return 401 (their problem
 * to fix, retrying is correct from their side).
 */
import {
  Controller,
  ForbiddenException,
  Injectable,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { WalletTopupService } from './wallet.topup.service';
import { WEBHOOK_INTENT_DESC_PREFIX } from './wallet.topup.service';

interface MoyasarWebhookEvent {
  id?: string;
  type?: string;
  secret_token?: unknown;
  data?: {
    id?: string;
    status?: string;
    description?: string | null;
    webhook_id?: string;
    verification_code?: string;
  } | null;
}

const LOG_CONFIRM_WINDOW_NOTE = 'confirm the webhook in the Moyasar dashboard (code valid 30 min)';

@Injectable()
@Controller('wallet/webhook')
export class WalletWebhookController {
  private readonly logger = new Logger(WalletWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly topupService: WalletTopupService,
  ) {}

  @Post()
  async handleMoyasarWebhook(@Req() req: RawBodyRequest<Request>): Promise<{ received: boolean }> {
    if (this.configService.get<string>('WALLET_WEBHOOK_ENABLED') !== 'true') {
      throw new ForbiddenException('Wallet webhook is disabled in this environment');
    }
    const expectedSecret = this.configService.get<string>('MOYASAR_WEBHOOK_SECRET');
    if (!expectedSecret) {
      // Flag on without a secret is a misconfiguration: fail closed.
      throw new ForbiddenException('Wallet webhook is not configured in this environment');
    }

    const event = this.parseBody(req);
    if (!this.assertSecret(event.secret_token, expectedSecret)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    switch (event.type) {
      case 'webhook_verification':
        this.handleVerification(event);
        return { received: true };
      case 'payment_paid':
        await this.handlePaymentPaid(event);
        return { received: true };
      default:
        // Acknowledged, not acted on (see header). Never tickle Moyasar retries
        // for events the wallet deliberately ignores.
        this.logger.log(`moyasar webhook ignored: type=${event.type} id=${event.id ?? '?'}`);
        return { received: true };
    }
  }

  /** Constant-time shared-secret compare; anything non-string fails closed. */
  private assertSecret(presented: unknown, expected: string): boolean {
    if (typeof presented !== 'string' || presented.length === 0) return false;
    const a = Buffer.from(presented, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) {
      // Length differ: burn a comparison anyway so response timing does not
      // reveal the expected secret's length class.
      timingSafeEqualSafe(a, b);
      return false;
    }
    return timingSafeEqualSafe(a, b);
  }

  private parseBody(req: RawBodyRequest<Request>): MoyasarWebhookEvent {
    const raw = req.rawBody;
    if (raw && Buffer.isBuffer(raw)) {
      try {
        return JSON.parse(raw.toString('utf8')) as MoyasarWebhookEvent;
      } catch {
        // Malformed JSON from the wire: the secret cannot be extracted, so the
        // sender CANNOT be authenticated → assertSecret will fail closed (401).
        // Moyasar retries are bounded (5×) and a corrupted delivery deserves
        // the redelivery signal more than a silent 2xx.
        this.logger.warn('moyasar webhook: malformed JSON body (secret not checked)');
        return {};
      }
    }
    // Express already parsed the body (rawBody unavailable — e.g. a spec or a
    // bootstrap without rawBody:true). Fall back to the parsed body.
    const parsed = (req.body ?? {}) as MoyasarWebhookEvent;
    return parsed;
  }

  /** The ONE-TIME verification event: surface the code so the owner can act. */
  private handleVerification(event: MoyasarWebhookEvent): void {
    const code = event.data?.verification_code ?? '(missing)';
    const webhookId = event.data?.webhook_id ?? '(missing)';
    const message = `Moyasar webhook verification code: ${code} (${LOG_CONFIRM_WINDOW_NOTE})`;
    this.logger.log(message);
    Sentry.captureMessage('Moyasar webhook verification code received', {
      level: 'warning',
      tags: { scope: 'wallet.webhook', webhookId: String(webhookId) },
      extra: { code: String(code) },
    });
  }

  /**
   * paid-credit path. Business rejections (mismatch/amount/race) land here as
   * errors from the service: log + Sentry + 2xx — Moyasar must not retry an
   * event our money-truth logic has already decided on.
   */
  private async handlePaymentPaid(event: MoyasarWebhookEvent): Promise<void> {
    const payment = event.data ?? {};
    const paymentId = payment.id;
    const description = payment.description ?? '';
    if (typeof paymentId !== 'string' || !description.startsWith(WEBHOOK_INTENT_DESC_PREFIX)) {
      this.logger.warn(
        `moyasar webhook payment_paid without usable binding: payment=${String(paymentId)} desc=${String(description)}`,
      );
      return;
    }
    const intentId = description.slice(WEBHOOK_INTENT_DESC_PREFIX.length);
    try {
      const result = await this.topupService.creditFromWebhook(intentId, paymentId);
      if (result.credited) {
        this.logger.log(
          `topup webhook credited: intent=${intentId} payment=${result.paymentId} amountSar=${result.amountSar}`,
        );
      } else {
        this.logger.log(
          `topup webhook replay: intent=${intentId} payment=${result.paymentId} alreadyCredited=true`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `moyasar webhook paid-event refused: intent=${intentId} payment=${paymentId} err=${err instanceof Error ? err.message : String(err)}`,
      );
      Sentry.captureException(err, {
        tags: { scope: 'wallet.webhook', intentId, paymentId },
      });
    }
  }
}

/** timingSafeEqual wrapper that never throws on length mismatch. */
function timingSafeEqualSafe(a: Buffer, b: Buffer): boolean {
  const { timingSafeEqual } = require('node:crypto') as typeof import('node:crypto');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
