import { ConfigService } from '@nestjs/config';

import { assertEmailDelivery } from './email-delivery';

// D-20261119-02 (run #218): prod-like runtimes must fail loud when
// transactional email cannot deliver (unset/unknown provider or missing
// provider key). Pins the isProdLike posture: staging is a public funnel —
// silent OTP loss there is an outage, not a tolerable dev behavior.
describe('assertEmailDelivery (D-20261119-02)', () => {
  const makeConfig = (env: Record<string, string | undefined>) =>
    ({
      get: (key: string) => env[key],
    }) as unknown as ConfigService;

  it('no-ops outside prod-like runtimes (local dev keeps log-only mode)', () => {
    expect(() =>
      assertEmailDelivery(makeConfig({ NODE_ENV: 'development' })),
    ).not.toThrow();
    expect(() =>
      assertEmailDelivery(
        makeConfig({ NODE_ENV: 'development', EMAIL_PROVIDER: 'brevo' }),
      ),
    ).not.toThrow();
  });

  it('staging (prod-like) throws when the chosen provider has no keys', () => {
    expect(() =>
      assertEmailDelivery(
        makeConfig({ NODE_ENV: 'staging', EMAIL_PROVIDER: 'brevo' }),
      ),
    ).toThrow('missing required env: BREVO_API_KEY, BREVO_FROM');
  });

  it('staging boots when brevo is fully configured (live staging parity)', () => {
    expect(() =>
      assertEmailDelivery(
        makeConfig({
          NODE_ENV: 'staging',
          EMAIL_PROVIDER: 'brevo',
          BREVO_API_KEY: 'k',
          BREVO_FROM: 'no-reply@koralink.sa',
        }),
      ),
    ).not.toThrow();
  });

  it('production + unset EMAIL_PROVIDER defaults to resend and demands RESEND_API_KEY', () => {
    expect(() =>
      assertEmailDelivery(makeConfig({ NODE_ENV: 'production' })),
    ).toThrow(
      'EMAIL_PROVIDER=resend in a production-like runtime is missing required env: RESEND_API_KEY',
    );
  });

  it('production + brevo throws naming exactly the missing env(s)', () => {
    expect(() =>
      assertEmailDelivery(
        makeConfig({ NODE_ENV: 'production', EMAIL_PROVIDER: 'brevo' }),
      ),
    ).toThrow('missing required env: BREVO_API_KEY, BREVO_FROM');
    expect(() =>
      assertEmailDelivery(
        makeConfig({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: 'brevo',
          BREVO_API_KEY: 'k',
        }),
      ),
    ).toThrow('missing required env: BREVO_FROM');
  });

  it('production boots with a complete brevo or resend configuration', () => {
    expect(() =>
      assertEmailDelivery(
        makeConfig({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: 'brevo',
          BREVO_API_KEY: 'k',
          BREVO_FROM: 'no-reply@koralink.sa',
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertEmailDelivery(
        makeConfig({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: 'resend',
          RESEND_API_KEY: 'k',
        }),
      ),
    ).not.toThrow();
  });

  it('throws on an unknown/typo provider (mailgun is not wired)', () => {
    expect(() =>
      assertEmailDelivery(
        makeConfig({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: 'mailgun',
          RESEND_API_KEY: 'k',
        }),
      ),
    ).toThrow('not a known transport (brevo | resend)');
  });

  it('normalizes case/whitespace exactly like the provider factory', () => {
    expect(() =>
      assertEmailDelivery(
        makeConfig({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: '  BREVO ',
          BREVO_API_KEY: 'k',
          BREVO_FROM: 'f',
        }),
      ),
    ).not.toThrow();
  });

  it('treats an EMPTY provider key value as missing (Boolean() parity with isConfigured)', () => {
    expect(() =>
      assertEmailDelivery(
        makeConfig({
          NODE_ENV: 'production',
          EMAIL_PROVIDER: 'brevo',
          BREVO_API_KEY: '',
          BREVO_FROM: 'f',
        }),
      ),
    ).toThrow('missing required env: BREVO_API_KEY');
  });
});
