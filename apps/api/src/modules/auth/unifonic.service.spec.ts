import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { UnifonicService } from './unifonic.service';
import { assertNoSecrets } from '../../common/utils/pii-safe-logging';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-11-16 owner P0 (VPS cutover test): the old no-credentials fallback
// logged `Skipping SMS to ${to}: "${body}"` — body contains the OTP code — and
// the endpoint still returned 200, so prod log readers could log in as any
// phone number while users waited forever for an SMS that never came.
//
// This spec pins the new contract:
//  1. The message body (and therefore the code) is NEVER logged at any level
//     in any environment — every log line must pass assertNoSecrets.
//  2. Unconfigured + prod-like (production|staging) → 503 SMS_UNAVAILABLE.
//  3. Unconfigured + non-prod → resolves (dev log-only path), still no code.
// ─────────────────────────────────────────────────────────────────────────────

describe('UnifonicService — no-credentials fallback (2026-11-16 P0)', () => {
  function makeService(nodeEnv: string | undefined): {
    service: UnifonicService;
    logLines: string[];
  } {
    const config = {
      get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined),
    };
    const service = new UnifonicService(config as unknown as ConfigService);
    // Spy on the REAL Nest Logger instance of this service: every line the
    // service logs lands here, prod-like or not — the no-code-in-logs rule
    // has no environment exemption.
    const logLines: string[] = [];
    const capture = (level: string) =>
      (message: unknown) => {
        logLines.push(`[${level}] ${String(message)}`);
      };
    Object.defineProperty(service, 'logger', {
      value: {
        log: capture('log'),
        warn: capture('warn'),
        error: capture('error'),
        debug: capture('debug'),
        verbose: capture('verbose'),
      },
      configurable: true,
    });
    return { service, logLines };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fail CLOSED in prod-like environments (NODE_ENV production|staging)', () => {
    it.each(['production', 'staging'])(
      'NODE_ENV=%s + empty UNIFONIC_APP_SID → sendSms throws 503 SMS_UNAVAILABLE',
      async (nodeEnv) => {
        const { service, logLines } = makeService(nodeEnv);
        const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({});

        const err = await service
          .sendSms('+966501234567', 'Your KoraLink code: 123456')
          .catch((e) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.getStatus()).toBe(503);
        expect(err.getResponse()).toMatchObject({
          code: 'SMS_UNAVAILABLE',
          message: 'SMS login is not available right now.',
        });
        // No real HTTP attempt: the service knows the provider is unconfigured.
        expect(postSpy).not.toHaveBeenCalled();

        // The fail line itself must not carry the code/body.
        expect(logLines.length).toBeGreaterThan(0);
        for (const line of logLines) expect(assertNoSecrets(line)).toBe(true);
      },
    );
  });

  describe('dev fallback stays open in non-prod environments', () => {
    it.each(['development', 'test', undefined])(
      'NODE_ENV=%j + empty SID → resolves without sending and NEVER logs the code/body',
      async (nodeEnv) => {
        const { service, logLines } = makeService(nodeEnv);
        const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({});

        await expect(
          service.sendSms('+966501234567', 'Your KoraLink code: 123456'),
        ).resolves.toBeUndefined();

        expect(postSpy).not.toHaveBeenCalled();
        for (const line of logLines) {
          expect(assertNoSecrets(line)).toBe(true);
          expect(line).toContain('+966*****567');
        }
      },
    );
  });

  describe('configured provider is unaffected', () => {
    it('sends via the Unifonic REST API when UNIFONIC_APP_SID is set', async () => {
      const config = {
        get: (key: string) =>
          key === 'UNIFONIC_APP_SID' ? 'app-sid-value' : undefined,
      };
      const service = new UnifonicService(config as unknown as ConfigService);
      const postSpy = jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ status: 200 });

      await service.sendSms('+966501234567', 'Your KoraLink code: 123456');

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [url, body] = postSpy.mock.calls[0];
      expect(url).toBe('https://el.cloud.unifonic.com/rest/SMS/messages');
      expect(String(body)).toContain('Recipient=%2B966501234567');
      expect(String(body)).toContain('Body=Your+KoraLink+code%3A+123456');
    });

    it('isConfigured() mirrors the App SID', () => {
      const configured = new UnifonicService({
        get: (key: string) =>
          key === 'UNIFONIC_APP_SID' ? 'app-sid-value' : undefined,
      } as unknown as ConfigService);
      const unconfigured = new UnifonicService({
        get: () => undefined,
      } as unknown as ConfigService);
      expect(configured.isConfigured()).toBe(true);
      expect(unconfigured.isConfigured()).toBe(false);
    });
  });
});
