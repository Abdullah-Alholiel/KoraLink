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

// ── P2-241 (Reviewer A run #153) — verify-otp route throttle + devLogin cookie ──

describe('AuthController — P2-241 route-level throttling + devLogin cookie hardening', () => {
  // Throttler v6 stores per-route metadata under `THROTTLER:<FIELD>default`
  // (the `default` named-runner suffix). Asserting the decorator metadata is
  // the direct pin: the route must carry its own 3-per-60s cap instead of
  // riding the global 60/min.
  const LIMIT_KEY = 'THROTTLER:LIMITdefault';
  const TTL_KEY = 'THROTTLER:TTLdefault';

  function methodOf(name: string): (this: never, ...args: never[]) => unknown {
    const proto = AuthController.prototype as unknown as Record<
      string,
      (this: never, ...args: never[]) => unknown
    >;
    const fn = proto[name];
    if (!fn) throw new Error(`AuthController.${name} missing`);
    return fn;
  }

  it('verify-otp carries a route-level 3/min throttle (P2-241)', () => {
    const verifyOtp = methodOf('verifyOtp');
    expect(Reflect.getMetadata(LIMIT_KEY, verifyOtp)).toBe(3);
    expect(Reflect.getMetadata(TTL_KEY, verifyOtp)).toBe(60_000);
  });

  it('send-otp keeps its route-level 3/min throttle (regression guard)', () => {
    const sendOtp = methodOf('sendOtp');
    expect(Reflect.getMetadata(LIMIT_KEY, sendOtp)).toBe(3);
    expect(Reflect.getMetadata(TTL_KEY, sendOtp)).toBe(60_000);
  });

  it('dev-login keeps its route-level 3/min throttle (run-3 audit guard)', () => {
    const devLogin = methodOf('devLogin');
    expect(Reflect.getMetadata(LIMIT_KEY, devLogin)).toBe(3);
  });

  it('devLogin cookie is secure:isProd — insecure in dev, secure in production (P2-241)', async () => {
    const token = 'dev.jwt.token';
    const makeController = (nodeEnv: string) =>
      new AuthController(
        { devLogin: jest.fn().mockResolvedValue(token) } as never,
        {
          get: jest.fn((key: string) =>
            key === 'NODE_ENV' ? nodeEnv : key === 'DEV_LOGIN_ENABLED' ? 'true' : undefined,
          ),
        } as never,
      );
    const makeRes = () => {
      const cookieCalls: Array<{ name: string; value: string; opts: Record<string, unknown> }> = [];
      return {
        cookie: jest.fn((name: string, value: string, opts: Record<string, unknown>) => {
          cookieCalls.push({ name, value, opts });
        }),
        cookieCalls,
      };
    };
    const dto = { phone: '+966****0001', surface: 'player' } as never;

    const devRes = makeRes();
    await makeController('development').devLogin(dto, devRes as never);
    expect(devRes.cookieCalls[0].name).toBe('access_token');
    expect(devRes.cookieCalls[0].opts).toMatchObject({ httpOnly: true, secure: false });

    const prodRes = makeRes();
    await makeController('production').devLogin(dto, prodRes as never);
    expect(prodRes.cookieCalls[0].opts).toMatchObject({ httpOnly: true, secure: true });
  });
});
