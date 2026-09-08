import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { EmailOtpService } from './email-otp.service';
import { ResendService } from './resend.service';

describe('EmailOtpService', () => {
  function setup(overrides: {
    otpStore?: Record<string, jest.Mock>;
    db?: Record<string, jest.Mock>;
    userRow?: Record<string, unknown> | undefined;
  } = {}) {
    const otpStore = {
      isCooldownActive: jest.fn().mockResolvedValue(false),
      getDailyCount: jest.fn().mockResolvedValue(0),
      getIpDailyCount: jest.fn().mockResolvedValue(0),
      incrementIpDaily: jest.fn().mockResolvedValue(1),
      setOtp: jest.fn().mockResolvedValue(undefined),
      setCooldown: jest.fn().mockResolvedValue(undefined),
      incrementDaily: jest.fn().mockResolvedValue(1),
      getOtp: jest.fn().mockResolvedValue('123456'),
      deleteOtp: jest.fn().mockResolvedValue(undefined),
      getFailCount: jest.fn().mockResolvedValue(0),
      incrementFail: jest.fn().mockResolvedValue(1),
      resetFails: jest.fn().mockResolvedValue(undefined),
      ...(overrides.otpStore ?? {}),
    };

    const existingUser = overrides.userRow;

    const db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(existingUser ? [existingUser] : []),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([
        {
          id: 'new-uuid',
          email: 'new@example.com',
          phone: null,
          role: 'Player',
          full_name: null,
          banned_at: null,
          suspended_until: null,
          deleted_at: null,
          email_verified_at: null,
        },
      ]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue(undefined),
    };

    const jwt = { signAsync: jest.fn().mockResolvedValue('jwt-token') };
    const config = { get: jest.fn().mockReturnValue('7d') };
    const resend = { send: jest.fn().mockResolvedValue(undefined) };

    const service = new EmailOtpService(
      db as never,
      jwt as never,
      config as never,
      otpStore as never,
      resend as never,
    );

    return { service, otpStore, db, jwt, resend };
  }

  const BASE_USER = {
    id: 'u-1',
    email: 'user@example.com',
    phone: null,
    role: 'Player',
    full_name: 'Existing',
    banned_at: null,
    suspended_until: null,
    deleted_at: null,
    email_verified_at: new Date('2026-01-01'),
  };

  it('sends OTP: stores code, starts cooldown + counters, calls Resend', async () => {
    const { service, otpStore, resend } = setup();
    await service.requestEmailOtp('User@Example.com', '1.2.3.4');
    expect(otpStore.setOtp).toHaveBeenCalledWith('email:User@Example.com', expect.any(String));
    expect(otpStore.setCooldown).toHaveBeenCalledWith('email:User@Example.com');
    expect(otpStore.incrementDaily).toHaveBeenCalledWith('email:User@Example.com');
    expect(otpStore.incrementIpDaily).toHaveBeenCalledWith('1.2.3.4');
    expect(resend.send).toHaveBeenCalledWith(
      'User@Example.com',
      expect.any(String),
      expect.stringContaining('KoraLink'),
    );
  });

  it('send blocked by cooldown (429)', async () => {
    const { service, resend } = setup({
      otpStore: { isCooldownActive: jest.fn().mockResolvedValue(true) },
    });
    await expect(service.requestEmailOtp('a@b.com')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('send blocked by daily cap (429)', async () => {
    const { service, resend } = setup({
      otpStore: { getDailyCount: jest.fn().mockResolvedValue(10) },
    });
    await expect(service.requestEmailOtp('a@b.com')).rejects.toBeInstanceOf(HttpException);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('send blocked by per-IP daily cap (429)', async () => {
    const { service, resend } = setup({
      otpStore: { getIpDailyCount: jest.fn().mockResolvedValue(50) },
    });
    await expect(service.requestEmailOtp('a@b.com', '1.2.3.4')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('send blocked for soft-deleted account (403) — no email dispatched', async () => {
    const { service, resend } = setup({
      userRow: { ...BASE_USER, deleted_at: new Date() },
    });
    await expect(service.requestEmailOtp('user@example.com')).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('verify: happy path (existing user) → token + isNewUser=false', async () => {
    const { service, otpStore, jwt } = setup({ userRow: { ...BASE_USER } });
    const out = await service.verifyEmailOtp('user@example.com', '123456', 'player');
    expect(out).toEqual({ token: 'jwt-token', isNewUser: false });
    expect(otpStore.deleteOtp).toHaveBeenCalledWith('email:user@example.com');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u-1', email: 'user@example.com', role: 'Player' }),
      expect.anything(),
    );
  });

  it('verify: unknown email → creates account, isNewUser=true', async () => {
    const { service, db, jwt } = setup({ userRow: undefined });
    const out = await service.verifyEmailOtp('new@example.com', '123456', 'player');
    expect(db.insert).toHaveBeenCalled();
    expect(out.isNewUser).toBe(true);
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.not.objectContaining({ phone: expect.anything() }),
      expect.anything(),
    );
  });

  it('verify: wrong code → fail counter incremented + 401', async () => {
    const { service, otpStore } = setup({
      otpStore: { getOtp: jest.fn().mockResolvedValue('999999') },
    });
    await expect(service.verifyEmailOtp('user@example.com', '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(otpStore.incrementFail).toHaveBeenCalledWith('email:user@example.com');
  });

  it('verify: locked out after 5 fails (429)', async () => {
    const { service } = setup({
      otpStore: { getFailCount: jest.fn().mockResolvedValue(5) },
    });
    await expect(service.verifyEmailOtp('user@example.com', '123456')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('verify: banned account → 403', async () => {
    const { service } = setup({ userRow: { ...BASE_USER, banned_at: new Date() } });
    await expect(service.verifyEmailOtp('user@example.com', '123456')).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('verify: surface separation — Player token rejected for ops', async () => {
    const { service } = setup({ userRow: { ...BASE_USER } });
    await expect(
      service.verifyEmailOtp('user@example.com', '123456', 'ops'),
    ).rejects.toBeInstanceOf(HttpException);
  });
});

describe('ResendService', () => {
  function make(configGet: (k: string) => string | undefined) {
    const config = { get: configGet };
    return new ResendService(config as never);
  }

  it('logs instead of sending when RESEND_API_KEY is empty', async () => {
    const svc = make(() => undefined);
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    await svc.send('a@b.com', 's', '<p>x</p>');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to Resend API when key present', async () => {
    const svc = make((k) => (k === 'RESEND_API_KEY' ? 're_key' : undefined));
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as never;
    await svc.send('a@b.com', 's', '<p>x</p>');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer re_key' }),
      }),
    );
  });

  it('throws 503 when provider rejects', async () => {
    const svc = make((k) => (k === 'RESEND_API_KEY' ? 're_key' : undefined));
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'err' });
    await expect(svc.send('a@b.com', 's', '<p>x</p>')).rejects.toBeInstanceOf(HttpException);
  });
});
