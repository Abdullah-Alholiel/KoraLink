import {
  CORS_DENY_MESSAGE,
  CORS_PROBE_BLOCKED_PREFIX,
  corsDenyMessage,
  isProbeShapedOrigin,
  isSentryDroppedCorsProbe,
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

describe('CORS deny message contract (P2-110, PR-Agent r1 pin)', () => {
  it('corsDenyMessage classifies probes vs infra denials', () => {
    expect(corsDenyMessage('https://attacker.example')).toBe(
      'CORS_PROBE_BLOCKED: https://attacker.example',
    );
    expect(corsDenyMessage('https://100.93.99.24:9450')).toBe(
      'CORS origin not allowed: https://100.93.99.24:9450',
    );
    expect(corsDenyMessage(undefined)).toBe('CORS origin not allowed: undefined');
  });

  it('beforeSend drop predicate is the exact construction twin (silent re-flood guard)', () => {
    // The Sentry drop in main.ts MUST fire for every probe-classified message
    // and NEVER for infra denials or unrelated errors.
    expect(isSentryDroppedCorsProbe(corsDenyMessage('https://attacker.example'))).toBe(
      true,
    );
    expect(isSentryDroppedCorsProbe(corsDenyMessage('https://100.93.99.24:9450'))).toBe(
      false,
    );
    expect(isSentryDroppedCorsProbe('Error: Failed query: select 1')).toBe(false);
    expect(isSentryDroppedCorsProbe(undefined)).toBe(false);
    expect(isSentryDroppedCorsProbe(42)).toBe(false);
  });

  it('message prefixes are the single shared constants (no inline drift)', () => {
    expect(CORS_PROBE_BLOCKED_PREFIX).toBe('CORS_PROBE_BLOCKED: ');
    expect(CORS_DENY_MESSAGE).toBe('CORS origin not allowed: ');
    expect(
      corsDenyMessage('https://attacker.example').startsWith(CORS_PROBE_BLOCKED_PREFIX),
    ).toBe(true);
    expect(
      corsDenyMessage('https://koralink.vercel.app').startsWith(CORS_DENY_MESSAGE),
    ).toBe(true);
  });
});
