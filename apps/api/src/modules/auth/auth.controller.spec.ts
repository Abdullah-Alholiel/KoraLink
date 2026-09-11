/**
 * AuthController.verifyOtp — P2-11 responseToken contract (run #49 follow-up).
 *
 * Field bug this locks down: on prod the PWA (vercel.app) and API
 * (onrender.com) are cross-origin, so browsers refuse to store the
 * cross-site `access_token` cookie. A phone-OTP signup therefore ended up
 * with ZERO credentials: verify 200 → complete-profile PATCH 401 → the
 * fetcher's 401 self-heal hard-refreshed to /login ("signed up, then
 * bounced back to login"). The email channel already had the opt-in body
 * token (email-auth.controller.ts); this spec pins the SAME contract on the
 * phone channel:
 *   - default (no opt-in): body is { isNewUser } — legacy callers unchanged
 *   - responseToken:true  → body is { isNewUser, token }
 *   - the HttpOnly cookie is set in BOTH cases (same-origin clients rely on it)
 */
import { AuthController } from './auth.controller';
import type { Response } from 'express';

describe('AuthController — POST /auth/verify-otp responseToken contract', () => {
  const token = 'signed.jwt.token';
  const service = { verifyOtp: jest.fn().mockResolvedValue({ token, isNewUser: true }) };
  const config = { get: jest.fn().mockReturnValue('production') };

  const cookies: Record<string, string> = {};
  const res = {
    cookie: jest.fn((name: string, value: string) => {
      cookies[name] = value;
    }),
  } as unknown as Response;

  const controller = new AuthController(
    service as never,
    config as never,
  );

  it('returns { isNewUser } only when the caller did NOT opt in (legacy shape)', async () => {
    const out = await controller.verifyOtp(
      { phone: '+966500000001', code: '123456' } as never,
      res,
    );
    expect(out).toEqual({ isNewUser: true });
    expect(res.cookie).toHaveBeenCalledWith(
      'access_token',
      token,
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('returns { isNewUser, token } when the caller opts in with responseToken:true', async () => {
    const out = await controller.verifyOtp(
      { phone: '+966500000001', code: '123456', responseToken: true } as never,
      res,
    );
    expect(out).toEqual({ isNewUser: true, token });
  });

  it('sets the HttpOnly cookie in both cases (same-origin clients still need it)', async () => {
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(cookies['access_token']).toBe(token);
  });
});
