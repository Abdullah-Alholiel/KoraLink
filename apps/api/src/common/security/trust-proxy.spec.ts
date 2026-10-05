import { resolveTrustProxyConfig } from './trust-proxy';

describe('resolveTrustProxyConfig', () => {
  describe('unset / empty → false (byte-compatible with all prior deploys)', () => {
    it('returns false when the env var is undefined', () => {
      expect(resolveTrustProxyConfig(undefined)).toBe(false);
    });

    it('returns false when the env var is empty', () => {
      expect(resolveTrustProxyConfig('')).toBe(false);
    });

    it('returns false when the env var is whitespace-only', () => {
      expect(resolveTrustProxyConfig('   ')).toBe(false);
    });
  });

  describe('positive integers → hop count', () => {
    it.each(['1', '2', '4', '10'])('accepts %s as a hop count', (raw) => {
      expect(resolveTrustProxyConfig(raw)).toBe(parseInt(raw, 10));
    });

    it.each(['0', '-1', '1.5', '007', '+2'])('rejects %s (not a clean positive integer)', (raw) => {
      expect(() => resolveTrustProxyConfig(raw)).toThrow(new RegExp(`TRUST_PROXY=${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    });
  });

  describe("'true' → trust the full X-Forwarded-For chain", () => {
    it('accepts true case-insensitively and normalizes to the Express magic string', () => {
      expect(resolveTrustProxyConfig('true')).toBe('true');
      expect(resolveTrustProxyConfig('TRUE')).toBe('true');
      expect(resolveTrustProxyConfig('True')).toBe('true');
    });
  });

  describe('garbage → boot-fail naming the exact live value (P0-3 doctrine)', () => {
    it('rejects Express keyword forms — ambiguous config is refused, not silently honored', () => {
      for (const bad of ['loopback', 'unip', 'bin', 'linklocal', 'false']) {
        expect(() => resolveTrustProxyConfig(bad)).toThrow(new RegExp(`TRUST_PROXY=${bad}`));
      }
    });

    it('rejects IP/CIDR comma lists (not supported in v1 — use a hop count)', () => {
      expect(() => resolveTrustProxyConfig('10.0.0.0/8,127.0.0.1')).toThrow(
        /TRUST_PROXY=10\.0\.0\.0\/8,127\.0\.0\.1/,
      );
    });

    it('rejects arbitrary junk naming it in the error', () => {
      expect(() => resolveTrustProxyConfig('yolo')).toThrow(/TRUST_PROXY=yolo/);
    });
  });
});
