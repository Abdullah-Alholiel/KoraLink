import {
  isProbeShapedOrigin,
  normalizeOrigin,
  originAllowed,
} from './cors-origin';

describe('cors-origin helpers (P2-201, run #131)', () => {
  describe('normalizeOrigin', () => {
    it('strips trailing slashes', () => {
      expect(normalizeOrigin('https://aa.tail2948f9.ts.net:10000/')).toBe(
        'https://aa.tail2948f9.ts.net:10000',
      );
      expect(normalizeOrigin('https://example.com///')).toBe('https://example.com');
    });

    it('leaves clean origins untouched', () => {
      expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
    });
  });

  describe('originAllowed', () => {
    const allowed = [
      'https://aa.tail2948f9.ts.net:10000',
      'https://aa.tail2948f9.ts.net:9450/',
    ];

    it('passes through non-browser requests (no Origin header)', () => {
      expect(originAllowed(undefined, allowed)).toBe(true);
    });

    it('allows an exact match', () => {
      expect(originAllowed('https://aa.tail2948f9.ts.net:10000', allowed)).toBe(true);
    });

    it('tolerates a trailing slash on the ALLOWED entry (misconfigured env)', () => {
      expect(originAllowed('https://aa.tail2948f9.ts.net:9450', allowed)).toBe(true);
    });

    it('tolerates a trailing slash on the INCOMING origin', () => {
      expect(
        originAllowed('https://aa.tail2948f9.ts.net:10000/', allowed),
      ).toBe(true);
    });

    it('rejects unknown origins', () => {
      expect(originAllowed('https://attacker.example', allowed)).toBe(false);
    });
  });

  describe('isProbeShapedOrigin (P2-110, run #137)', () => {
    it('classifies RFC 2606 reserved TLDs as probes', () => {
      expect(isProbeShapedOrigin('https://attacker.example')).toBe(true);
      expect(isProbeShapedOrigin('http://scan.test')).toBe(true);
      expect(isProbeShapedOrigin('http://nope.invalid')).toBe(true);
      expect(isProbeShapedOrigin('http://probe.localhost')).toBe(true);
      expect(isProbeShapedOrigin('https://example.com')).toBe(true);
      expect(isProbeShapedOrigin('https://sub.evil.com')).toBe(true);
    });

    it('is case- and trailing-slash tolerant (normalizeOrigin first)', () => {
      expect(isProbeShapedOrigin('https://ATTACKER.EXAMPLE/')).toBe(true);
    });

    it('classifies attacker-labelled hosts as probes', () => {
      expect(isProbeShapedOrigin('https://attacker.io')).toBe(true);
      expect(isProbeShapedOrigin('https://sub.attacker.example:8080')).toBe(true);
    });

    it('NEVER classifies infra-shaped origins as probes (a denial there is an incident)', () => {
      expect(isProbeShapedOrigin('https://100.93.99.24:9450')).toBe(false);
      expect(isProbeShapedOrigin('http://192.168.1.50:3000')).toBe(false);
      expect(isProbeShapedOrigin('https://aa.tail2948f9.ts.net:10000')).toBe(false);
      expect(isProbeShapedOrigin('https://koralink.vercel.app')).toBe(false);
      expect(isProbeShapedOrigin('https://player.example-saudiarabia.com')).toBe(false);
    });

    it('handles garbage and empty input defensively', () => {
      expect(isProbeShapedOrigin(undefined)).toBe(false);
      expect(isProbeShapedOrigin('')).toBe(false);
      expect(isProbeShapedOrigin('not a url')).toBe(false);
      expect(isProbeShapedOrigin('///')).toBe(false);
    });

    it('does not false-positive on hosts merely CONTAINING reserved words', () => {
      expect(isProbeShapedOrigin('https://example museum.com')).toBe(false);
      expect(isProbeShapedOrigin('https://attackerwatch.com')).toBe(false);
    });
  });
});
