import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpStoreService } from './otp-store.service';

/**
 * P1-47 (run #56) — moderation blocks carry stable machine codes.
 *
 * The PWA classifies error bodies by `code` (error-classify.ts): a
 * banned/suspended account must render the localized blocked screen, never a
 * generic "login failed". The Nest response keeps `message` (older clients and
 * existing spec pins rely on it) — the `code` is additive.
 *
 * Exercised via devLogin — it hits the SAME ban/suspend guard block as the
 * OTP verify path (identical throw sites in auth.service.ts).
 */
describe('AuthService moderation codes (P1-47)', () => {
  function setup(userRow: unknown) {
    const db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(userRow ? [userRow] : []),
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    const config = {
      get: jest.fn((key: string) =>
        key === 'JWT_EXPIRY' ? '7d' : undefined,
      ),
    };
    const otpStore = {} as OtpStoreService;
    const unifonic = {} as any;

    const service = new AuthService(
      db as any,
      jwt as any,
      config as any,
      unifonic,
      otpStore,
    );
    return { service };
  }

  it('devLogin: banned account → ForbiddenException with code ACCOUNT_BANNED', async () => {
    const { service } = setup({
      id: 'u1',
      phone: '+966****0001',
      role: 'Player',
      banned_at: new Date(),
      suspended_until: null,
    });

    const err = await service
      .devLogin('+966****0001')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    const body = (err as ForbiddenException).getResponse() as Record<string, unknown>;
    expect(body.code).toBe('ACCOUNT_BANNED');
    expect(body.message).toBe('Account banned.');
  });

  it('devLogin: suspended account → ForbiddenException with code ACCOUNT_SUSPENDED', async () => {
    const { service } = setup({
      id: 'u2',
      phone: '+966****0002',
      role: 'Player',
      banned_at: null,
      suspended_until: new Date(Date.now() + 86_400_000),
    });

    const err = await service
      .devLogin('+966****0002')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    const body = (err as ForbiddenException).getResponse() as Record<string, unknown>;
    expect(body.code).toBe('ACCOUNT_SUSPENDED');
    // P1-47: the end instant rides in the message so the PWA blocked card
    // can show the exact date/time localized.
    expect(body.message).toMatch(/^Account suspended until \d{4}-\d{2}-\d{2}T/);
  });

  it('throw bodies carry BOTH message and code (contract shape)', () => {
    const err = new ForbiddenException({
      message: 'Account banned.',
      code: 'ACCOUNT_BANNED',
    });
    const body = err.getResponse() as Record<string, unknown>;
    // Nest keeps object responses verbatim — message survives for old clients.
    expect(body).toEqual({
      message: 'Account banned.',
      code: 'ACCOUNT_BANNED',
    });
    // And the exception's message stays the human text (spec pins rely on it).
    expect(err.message).toBe('Account banned.');
  });
});
