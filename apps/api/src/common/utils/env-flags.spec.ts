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

    // Run #205 (Reviewer A IMPORTANT, parent-verified): the prod+true case below
    // was ORIGINALLY pinned as a "documented owner escape hatch" (PR #216 r2,
    // run #188). That was a factory-authored default, never an owner ledger
    // decision — and it silently re-exposed /api/docs in production (the exact
    // Strix run-#183 MEDIUM this file exists to close). Superseded by the
    // symmetric prod guard; if the owner wants an emergency prod-Swagger
    // lever, that is an explicit DECISIONS.md row that reintroduces it.
    it('throws when production explicitly enables Swagger (Strix run-#183 class)', () => {
      expect(() =>
        assertEnvFlags(makeConfig({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })),
      ).toThrow('SWAGGER_ENABLED=true is not allowed when NODE_ENV=production');
    });

    it.each([
      ['production', 'false'],
      ['production', undefined],
      ['staging', 'true'],
      ['staging', 'false'],
      ['staging', undefined],
      ['development', 'true'],
      ['development', 'false'],
      [undefined, 'true'],
    ])('allows NODE_ENV=%s with SWAGGER_ENABLED=%s (no throw)', (nodeEnv, flag) => {
      expect(() =>
        assertEnvFlags(makeConfig({ NODE_ENV: nodeEnv, SWAGGER_ENABLED: flag })),
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
