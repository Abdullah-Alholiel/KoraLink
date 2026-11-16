import { ConfigService } from '@nestjs/config';
import { ResendService } from './resend.service';
import { BrevoService } from './brevo.service';
import { assertNoSecrets } from '../../common/utils/pii-safe-logging';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-11-16 owner P0: the no-API-key dev fallbacks logged the OTP code
// (`code=${debugCode}`) plus the raw recipient address on BOTH email adapters.
// Any key-empty environment (a staging cutover, a misconfigured prod) wrote
// login codes to the logs. Contract now: the fallback logs ONLY the masked
// destination — never the code, never the body — via the shared logger spy.
// ─────────────────────────────────────────────────────────────────────────────

describe.each([
  ['ResendService', ResendService],
  ['BrevoService', BrevoService],
])('%s — no-key fallback never logs the code (2026-11-16 P0)', (name, Ctor) => {
  function makeService(): { service: ResendService | BrevoService; logLines: string[] } {
    const config = { get: () => undefined } as unknown as ConfigService;
    const service = new Ctor(config);
    const logLines: string[] = [];
    const capture =
      (level: string) =>
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

  it('isConfigured() is false without a key', () => {
    const { service } = makeService();
    expect(service.isConfigured()).toBe(false);
  });

  it('send() resolves in fallback mode and the log line carries NO code, NO body, NO raw address', async () => {
    const { service, logLines } = makeService();

    await expect(
      service.send(
        'abdullah@gmail.com',
        'Your KoraLink login code',
        '<html>code 123456</html>',
        '123456',
      ),
    ).resolves.toBeUndefined();

    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) {
      expect(assertNoSecrets(line)).toBe(true);
      expect(line).not.toContain('123456');
      expect(line).not.toContain('abdullah@gmail.com');
    }
  });

  it('send() without the debugCode param is equally safe', async () => {
    const { service, logLines } = makeService();

    await expect(
      service.send('abdullah@gmail.com', 'Your KoraLink login code', '<html>123456</html>'),
    ).resolves.toBeUndefined();

    for (const line of logLines) expect(assertNoSecrets(line)).toBe(true);
  });
});
