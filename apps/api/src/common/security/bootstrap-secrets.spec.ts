import { assertBootstrapSecrets, isPlaceholderSecret } from './bootstrap-secrets';

describe('bootstrap-secrets (P0-3)', () => {
  describe('isPlaceholderSecret', () => {
    it.each([
      [undefined, true],
      [null, true],
      ['', true],
      ['   ', true],
      ['secret', true],
      ['change-me', true],
      ['change-me-to-a-random-64-char-string', true],
      ['change-me-to-another-random-string', true],
      ['CHANGE-ME', true],
      ['fallback-dev-secret', true],
      ['your-secret-here', true],
      ['replace-me', true],
      ['some-placeholder-value', true],
    ])('flags %j as placeholder', (value, expected) => {
      expect(isPlaceholderSecret(value as string | undefined)).toBe(expected);
    });

    it.each([
      ['a'.repeat(64), false],
      ['super-secure-real-random-secret-9f3a', false],
    ])('accepts real secret %s', (value, expected) => {
      expect(isPlaceholderSecret(value)).toBe(expected);
    });
  });

  describe('assertBootstrapSecrets', () => {
    const valid = {
      jwtSecret: 'a'.repeat(64),
      cookieSecret: 'b'.repeat(64),
      nodeEnv: 'development',
    };

    it('throws when JWT_SECRET is a placeholder', () => {
      expect(() => assertBootstrapSecrets({ ...valid, jwtSecret: 'change-me' })).toThrow(
        /JWT_SECRET/,
      );
    });

    it('throws when COOKIE_SECRET is a placeholder', () => {
      expect(() => assertBootstrapSecrets({ ...valid, cookieSecret: 'change-me' })).toThrow(
        /COOKIE_SECRET/,
      );
    });

    it('throws when a secret is missing/empty', () => {
      expect(() => assertBootstrapSecrets({ ...valid, jwtSecret: '' })).toThrow(/JWT_SECRET/);
      expect(() => assertBootstrapSecrets({ jwtSecret: 'a'.repeat(64) })).toThrow(/COOKIE_SECRET/);
    });

    it('does NOT throw for valid secrets in development', () => {
      expect(() => assertBootstrapSecrets(valid)).not.toThrow();
    });

    it('throws for a short secret in production', () => {
      expect(() =>
        assertBootstrapSecrets({ jwtSecret: 'short', cookieSecret: 'b'.repeat(64), nodeEnv: 'production' }),
      ).toThrow(/JWT_SECRET.*chars/);
    });

    it('tolerates a short (but non-placeholder) secret in development', () => {
      expect(() =>
        assertBootstrapSecrets({ jwtSecret: 'short-dev-only', cookieSecret: 'b'.repeat(64), nodeEnv: 'development' }),
      ).not.toThrow();
    });

    it('throws for a valid-length secret that still matches a placeholder marker', () => {
      expect(() =>
        assertBootstrapSecrets({
          jwtSecret: 'x'.repeat(40) + '-placeholder-' + 'y'.repeat(20),
          cookieSecret: 'b'.repeat(64),
          nodeEnv: 'development',
        }),
      ).toThrow(/JWT_SECRET/);
    });
  });
});
