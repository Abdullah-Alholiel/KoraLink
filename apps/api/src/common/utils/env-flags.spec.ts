import { ConfigService } from '@nestjs/config';

import {
  assertEnvFlags,
  isCookieSecure,
  isSwaggerEnabled,
} from './env-flags';

// P1-72 (run #188): explicit COOKIE_SECURE / SWAGGER_ENABLED flags with the
// legacy NODE_ENV derivation as the unset default. Tripwire: the flag matrix
// must stay EXACTLY this shape — a regression that reintroduces a bare
// NODE_ENV string gate (Strix run-#183 MEDIUM) fails here.
describe('env-flags (P1-72)', () => {
  const makeConfig = (env: Record<string, string | undefined>) =>
    ({
      get: (key: string) => env[key],
    }) as unknown as ConfigService;

  describe('assertEnvFlags (PR-Agent r1: fail-loud boot validation)', () => {
    it('accepts unset, true, and false values', () => {
      expect(() =>
        assertEnvFlags(makeConfig({ COOKIE_SECURE: 'true', SWAGGER_ENABLED: 'false' })),
      ).not.toThrow();
      expect(() => assertEnvFlags(makeConfig({}))).not.toThrow();
    });

    it.each([
      ['COOKIE_SECURE', 'True'],
      ['COOKIE_SECURE', 'yes'],
      ['COOKIE_SECURE', ''],
      ['SWAGGER_ENABLED', 'off'],
    ])('throws on %s=%s (typo protection)', (name, value) => {
      expect(() => assertEnvFlags(makeConfig({ [name]: value }))).toThrow(
        `${name}=${value} is invalid`,
      );
    });

    it('throws when production sets COOKIE_SECURE=false (P2-241 invariant)', () => {
      expect(() =>
        assertEnvFlags(makeConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })),
      ).toThrow('must be secure in production');
    });

    it.each([
      ['production', 'true'],
      ['production', undefined],
      ['staging', 'false'],
      ['development', 'false'],
    ])('allows NODE_ENV=%s with COOKIE_SECURE=%s', (nodeEnv, flag) => {
      expect(() =>
        assertEnvFlags(makeConfig({ NODE_ENV: nodeEnv, COOKIE_SECURE: flag })),
      ).not.toThrow();
    });

    it('allows SWAGGER_ENABLED=true in production (documented owner escape hatch)', () => {
      expect(() =>
        assertEnvFlags(makeConfig({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })),
      ).not.toThrow();
    });

    it('compose: the assert is the guard — without it the getters fall through to legacy', () => {
      const cfg = makeConfig({ COOKIE_SECURE: 'True', NODE_ENV: 'staging' });
      expect(() => assertEnvFlags(cfg)).toThrow('COOKIE_SECURE=True is invalid');
      // Documents WHY assertEnvFlags must stay in bootstrap(): the getter
      // alone silently falls through to the legacy derivation on junk values.
      expect(isCookieSecure(cfg)).toBe(false);
    });
  });

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
