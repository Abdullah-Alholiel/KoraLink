import {
  assertNoSecrets,
  deliveryUnavailable,
  maskEmail,
  maskPhone,
} from './pii-safe-logging';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-11-16 owner P0: OTP codes leaked to logs. House rule: an OTP code, a
// full message body, or a raw destination NEVER appears in a log line at any
// level in any environment. These helpers are the enforcement surface — this
// spec is the tripwire that keeps them honest.
// ─────────────────────────────────────────────────────────────────────────────

describe('pii-safe-logging helpers', () => {
  describe('maskPhone', () => {
    it('masks a full Saudi number to its last 3 digits', () => {
      expect(maskPhone('+966501234567')).toBe('+966*****567');
    });

    it('masks a bare subscriber number', () => {
      expect(maskPhone('501234567')).toBe('+966*****567');
    });

    it('falls back safely for garbage/short input', () => {
      expect(maskPhone('+966')).toBe('+966*****');
      expect(maskPhone('')).toBe('+966*****');
    });

    it('output never trips the secret scanner (no 9-digit run)', () => {
      expect(assertNoSecrets(maskPhone('+966501234567'))).toBe(true);
    });
  });

  describe('maskEmail', () => {
    it('keeps the first 2 local-part characters and the domain', () => {
      // 'abdullah' = 8 local chars → head 'ab' + 6 masked chars.
      expect(maskEmail('abdullah@gmail.com')).toBe('ab******@gmail.com');
    });

    it('handles short local parts', () => {
      const masked = maskEmail('a@b.co');
      expect(masked.startsWith('a*')).toBe(true);
      expect(masked.endsWith('@b.co')).toBe(true);
    });

    it('returns *** for non-email garbage', () => {
      expect(maskEmail('not-an-email')).toBe('***');
    });

    it('output never trips the secret scanner (no raw address)', () => {
      expect(assertNoSecrets(maskEmail('abdullah@gmail.com'))).toBe(true);
    });
  });

  describe('deliveryUnavailable', () => {
    it('names the missing config and carries ONLY the masked destination', () => {
      const line = deliveryUnavailable('UNIFONIC_APP_SID', maskPhone('+966501234567'));
      expect(line).toContain('UNIFONIC_APP_SID');
      expect(line).toContain('+966*****567');
      expect(assertNoSecrets(line)).toBe(true);
    });

    it('carries no message body even when the caller passes one by mistake', () => {
      // Guard against future misuse: the helper signature has no body param,
      // so a body concatenated into the destination cannot pass the scanner.
      const line = deliveryUnavailable(
        'UNIFONIC_APP_SID',
        maskPhone('+966501234567') + ' Your KoraLink code: 123456',
      );
      expect(assertNoSecrets(line)).toBe(false);
    });
  });

  describe('assertNoSecrets — the log-line scanner', () => {
    it.each([
      ['plain operational text', true],
      ['send-otp blocked (cooldown) for +966*****567 (retryAfter 42s)', true],
      ['RESEND_API_KEY not configured — delivery skipped (would have gone to ab********@gmail.com)', true],
    ])('accepts safe line: %s', (line, expected) => {
      expect(assertNoSecrets(line)).toBe(expected);
    });

    it.each([
      ['a bare 6-digit code', '123456'],
      ['the old Unifonic incident line', 'Skipping SMS to +966501234567: "Your KoraLink code: 123456"'],
      ['a code glued into prose', 'code=654321 sent'],
      ['an unmasked phone', 'send-otp blocked for +966501234567'],
      ['a raw email', 'email OTP dispatched to abdullah@gmail.com'],
    ])('rejects %s', (_name, line) => {
      expect(assertNoSecrets(line)).toBe(false);
    });
  });
});
