import { ConfigService } from '@nestjs/config';

import { isCookieSecure, isSwaggerEnabled } from './env-flags';

// P1-72 (run #188): explicit COOKIE_SECURE / SWAGGER_ENABLED flags with the
// legacy NODE_ENV derivation as the unset default. Tripwire: the flag matrix
// must stay EXACTLY this shape — a regression that reintroduces a bare
// NODE_ENV string gate (Strix run-#183 MEDIUM) fails here.
describe('env-flags (P1-72)', () => {
  const makeConfig = (env: Record<string, string | undefined>) =>
    ({
      get: (key: string) => env[key],
    }) as unknown as ConfigService;

  describe('isCookieSecure', () => {
    it.each([
      ['true', undefined, true],
      ['false', 'production', false],
      ['false', 'staging', false],
    ])('COOKIE_SECURE=%s overrides NODE_ENV=%s', (flag, nodeEnv, expected) => {
      expect(isCookieSecure(makeConfig({ COOKIE_SECURE: flag, NODE_ENV: nodeEnv }))).toBe(
        expected,
      );
    });

    it.each([
      ['production', true],
      ['staging', false],
      ['development', false],
      [undefined, false],
    ])('unset flag + NODE_ENV=%s keeps legacy derivation', (nodeEnv, expected) => {
      expect(isCookieSecure(makeConfig({ NODE_ENV: nodeEnv }))).toBe(expected);
    });

    it('junk flag value falls through to legacy derivation', () => {
      expect(isCookieSecure(makeConfig({ COOKIE_SECURE: 'yes', NODE_ENV: 'staging' }))).toBe(
        false,
      );
      expect(
        isCookieSecure(makeConfig({ COOKIE_SECURE: 'yes', NODE_ENV: 'production' })),
      ).toBe(true);
    });
  });

  describe('isSwaggerEnabled', () => {
    it.each([
      ['true', 'production', true],
      ['false', 'staging', false],
      ['false', 'development', false],
    ])('SWAGGER_ENABLED=%s overrides NODE_ENV=%s', (flag, nodeEnv, expected) => {
      expect(isSwaggerEnabled(makeConfig({ SWAGGER_ENABLED: flag, NODE_ENV: nodeEnv }))).toBe(
        expected,
      );
    });

    it.each([
      ['production', false],
      ['staging', true],
      ['development', true],
      [undefined, true],
    ])('unset flag + NODE_ENV=%s keeps legacy derivation', (nodeEnv, expected) => {
      expect(isSwaggerEnabled(makeConfig({ NODE_ENV: nodeEnv }))).toBe(expected);
    });

    it('junk flag value falls through to legacy derivation', () => {
      expect(isSwaggerEnabled(makeConfig({ SWAGGER_ENABLED: 'no', NODE_ENV: 'production' }))).toBe(
        false,
      );
      expect(isSwaggerEnabled(makeConfig({ SWAGGER_ENABLED: 'no', NODE_ENV: 'staging' }))).toBe(
        true,
      );
    });
  });
});
