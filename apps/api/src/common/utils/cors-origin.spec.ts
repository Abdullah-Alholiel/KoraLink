import { normalizeOrigin, originAllowed } from './cors-origin';

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
});
