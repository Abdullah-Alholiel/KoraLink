/**
 * F2 (run #223) — Moyasar webhook controller specs.
 *
 * Security-critical paths: flag gating (fail-closed), constant-time secret
 * compare (fail-closed on non-string/missing), event routing (verification
 * surfaces the code; paid events go through the service's Moyasar-authoritative
 * credit; everything else acknowledged 2xx), and the no-retry contract
 * (business refusals still return 2xx so Moyasar never retry-storms).
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

jest.mock('@sentry/node', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/node';
import { WalletWebhookController } from './wallet.webhook.controller';
import { WEBHOOK_INTENT_DESC_PREFIX } from './wallet.topup.service';

const mockedCaptureMessage = Sentry.captureMessage as jest.Mock;
const mockedCaptureException = Sentry.captureException as jest.Mock;

function makeConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as never;
}

function makeService() {
  return { creditFromWebhook: jest.fn().mockResolvedValue({ credited: true, alreadyCredited: false, balance: '50.00', paymentId: 'pay_1', amountSar: 50 }) } as never;
}

function makeReq(event: unknown, opts: { raw?: boolean; malformed?: boolean } = {}) {
  if (opts.raw === false) return { body: event } as never;
  const body = opts.malformed ? 'not-json{' : JSON.stringify(event);
  return { rawBody: Buffer.from(body, 'utf8') } as never;
}

function paidEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    type: 'payment_paid',
    secret_token: 'whsec_test',
    data: {
      id: 'pay_1',
      status: 'paid',
      description: `${WEBHOOK_INTENT_DESC_PREFIX}intent-1`,
    },
    ...overrides,
  };
}

async function makeController(config: Record<string, string>, service = makeService()) {
  const loggerLog = jest.fn();
  const loggerWarn = jest.fn();
  const controller = new WalletWebhookController(makeConfig(config), service);
  (controller as unknown as { logger: { log: ReturnType<typeof jest.fn>; warn: ReturnType<typeof jest.fn> } }).logger = {
    log: loggerLog,
    warn: loggerWarn,
  };
  return { controller, service: service as { creditFromWebhook: jest.Mock }, loggerLog, loggerWarn };
}

const FLAG_ON = { WALLET_WEBHOOK_ENABLED: 'true', MOYASAR_WEBHOOK_SECRET: 'whsec_test' };

describe('WalletWebhookController — F2 flag + secret gating', () => {
  it('403 when the flag is off (default posture)', async () => {
    const { controller } = await makeController({ WALLET_WEBHOOK_ENABLED: 'false', MOYASAR_WEBHOOK_SECRET: 'whsec_test' });
    await expect(controller.handleMoyasarWebhook(makeReq(paidEvent()))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('403 when the flag is on but no secret is configured (fail closed)', async () => {
    const { controller } = await makeController({ WALLET_WEBHOOK_ENABLED: 'true' });
    await expect(controller.handleMoyasarWebhook(makeReq(paidEvent()))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('401 on a wrong secret', async () => {
    const { controller, service } = await makeController(FLAG_ON);
    await expect(
      controller.handleMoyasarWebhook(makeReq(paidEvent({ secret_token: 'wrong' }))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.creditFromWebhook).not.toHaveBeenCalled();
  });

  it('401 when secret_token is missing or not a string (never throws)', async () => {
    const { controller, service } = await makeController(FLAG_ON);
    await expect(controller.handleMoyasarWebhook(makeReq(paidEvent({ secret_token: undefined })))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.handleMoyasarWebhook(makeReq(paidEvent({ secret_token: 123 })))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.creditFromWebhook).not.toHaveBeenCalled();
  });

  it('200 {received:true} on a correct secret with rawBody parsing', async () => {
    const { controller, service } = await makeController(FLAG_ON);
    await expect(controller.handleMoyasarWebhook(makeReq(paidEvent()))).resolves.toEqual({ received: true });
    expect(service.creditFromWebhook).toHaveBeenCalledWith('intent-1', 'pay_1');
  });

  it('parses req.body when rawBody is unavailable (fallback path)', async () => {
    const { controller, service } = await makeController(FLAG_ON);
    await expect(controller.handleMoyasarWebhook(makeReq(paidEvent(), { raw: false }))).resolves.toEqual({ received: true });
    expect(service.creditFromWebhook).toHaveBeenCalledWith('intent-1', 'pay_1');
  });

  it('401 on malformed JSON (cannot authenticate an unparseable sender — fail closed)', async () => {
    const { controller, service, loggerWarn } = await makeController(FLAG_ON);
    await expect(controller.handleMoyasarWebhook(makeReq({}, { malformed: true }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.creditFromWebhook).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('malformed JSON'));
  });
});

describe('WalletWebhookController — event routing', () => {
  it('webhook_verification surfaces the code via log + Sentry, 2xx', async () => {
    const { controller, service, loggerLog } = await makeController(FLAG_ON);
    const evt = {
      id: 'evt-v', type: 'webhook_verification', secret_token: 'whsec_test',
      data: { webhook_id: 'wh-1', verification_code: '482913' },
    };
    await expect(controller.handleMoyasarWebhook(makeReq(evt))).resolves.toEqual({ received: true });
    expect(loggerLog).toHaveBeenCalledWith(expect.stringContaining('482913'));
    expect(mockedCaptureMessage).toHaveBeenCalledWith(
      'Moyasar webhook verification code received',
      expect.objectContaining({ tags: expect.objectContaining({ scope: 'wallet.webhook' }) }),
    );
    expect(service.creditFromWebhook).not.toHaveBeenCalled();
  });

  it('payment_paid credit success → 200 + credited log', async () => {
    const { controller, loggerLog } = await makeController(FLAG_ON);
    await controller.handleMoyasarWebhook(makeReq(paidEvent()));
    expect(loggerLog).toHaveBeenCalledWith(expect.stringContaining('topup webhook credited'));
  });

  it('payment_paid business refusal (ConflictException) → STILL 2xx (no Moyasar retry) + Sentry', async () => {
    const { controller, service } = await makeController(FLAG_ON);
    const { ConflictException } = await import('@nestjs/common');
    service.creditFromWebhook.mockRejectedValue(
      new ConflictException({ message: 'amount_mismatch: 50 != 100', code: 'amount_mismatch' }),
    );
    await expect(controller.handleMoyasarWebhook(makeReq(paidEvent()))).resolves.toEqual({ received: true });
    expect(mockedCaptureException).toHaveBeenCalled();
  });

  it('business refusals ACK; transient failures RETHROW (Moyasar redelivers) — PR-Agent r1 run-#223', async () => {
    const { controller } = await makeController(FLAG_ON);
    // Conflict/NotFound = decided outcomes → 2xx.
    const { ConflictException, NotFoundException } = await import('@nestjs/common');
    const businessA = await makeController(FLAG_ON);
    (businessA.service.creditFromWebhook as jest.Mock).mockRejectedValue(new ConflictException('payment_intent_mismatch: no'));
    await expect(businessA.controller.handleMoyasarWebhook(makeReq(paidEvent()))).resolves.toEqual({ received: true });
    const businessB = await makeController(FLAG_ON);
    (businessB.service.creditFromWebhook as jest.Mock).mockRejectedValue(new NotFoundException('intent gone'));
    await expect(businessB.controller.handleMoyasarWebhook(makeReq(paidEvent()))).resolves.toEqual({ received: true });
    // Transient infra failure → rethrow (5xx → Moyasar retry).
    const transient = await makeController(FLAG_ON);
    (transient.service.creditFromWebhook as jest.Mock).mockRejectedValue(new Error('PostgresError: quota exceeded'));
    await expect(transient.controller.handleMoyasarWebhook(makeReq(paidEvent()))).rejects.toThrow('quota exceeded');
  });

  it('payment_paid without a usable description binding → 2xx, service untouched', async () => {
    const { controller, service, loggerWarn } = await makeController(FLAG_ON);
    const evt = paidEvent({ data: { id: 'pay_2', status: 'paid', description: 'unrelated' } });
    await expect(controller.handleMoyasarWebhook(makeReq(evt))).resolves.toEqual({ received: true });
    expect(service.creditFromWebhook).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('unhandled event types (payment_failed etc.) → 2xx, service untouched', async () => {
    const { controller, service } = await makeController(FLAG_ON);
    for (const type of ['payment_failed', 'payment_refunded', 'payment_voided', 'card_auth_authenticated']) {
      await expect(controller.handleMoyasarWebhook(makeReq(paidEvent({ type })))).resolves.toEqual({ received: true });
    }
    expect(service.creditFromWebhook).not.toHaveBeenCalled();
  });
});
