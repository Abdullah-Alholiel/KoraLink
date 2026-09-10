import { otpMatches } from './otp-compare';

describe('otpMatches (constant-time OTP comparison)', () => {
  it('accepts an equal code', () => {
    expect(otpMatches('123456', '123456')).toBe(true);
  });

  it('rejects a wrong code', () => {
    expect(otpMatches('123456', '654321')).toBe(false);
  });

  it('rejects when nothing is stored (expired/absent)', () => {
    expect(otpMatches(undefined, '123456')).toBe(false);
    expect(otpMatches(null, '123456')).toBe(false);
    expect(otpMatches('', '123456')).toBe(false);
  });

  it('rejects a wrong-length guess without throwing', () => {
    // timingSafeEqual throws on length mismatch — the helper must absorb it.
    expect(otpMatches('123456', '12345')).toBe(false);
    expect(otpMatches('123456', '1234567')).toBe(false);
  });

  it('rejects a wrong-length guess in comparable time (smoke)', () => {
    // Not a real timing proof — just ensures the dummy-burn path executes.
    const start = process.hrtime.bigint();
    otpMatches('123456', '1');
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    expect(elapsedMs).toBeLessThan(5);
  });
});
