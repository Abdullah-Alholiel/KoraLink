import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { EmailOtpService } from './email-otp.service';
import { ResendService } from './resend.service';
import { BrevoService, parseFromAddress } from './brevo.service';
import { EMAIL_SENDER_PROVIDER } from './email-sender.provider';

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
    const emailSender = { send: jest.fn().mockResolvedValue(undefined) };

    const service = new EmailOtpService(
      db as never,
      jwt as never,
      config as never,
      otpStore as never,
      emailSender as never,
    );

    return { service, otpStore, db, jwt, emailSender };
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

  it('sends OTP: stores code, starts cooldown + counters, dispatches email', async () => {
    const { service, otpStore, emailSender } = setup();
    await service.requestEmailOtp('User@Example.com', '1.2.3.4');
    expect(otpStore.setOtp).toHaveBeenCalledWith('email:User@Example.com', expect.any(String));
    expect(otpStore.setCooldown).toHaveBeenCalledWith('email:User@Example.com');
    expect(otpStore.incrementDaily).toHaveBeenCalledWith('email:User@Example.com');
    expect(otpStore.incrementIpDaily).toHaveBeenCalledWith('1.2.3.4');
    expect(emailSender.send).toHaveBeenCalledWith(
      'User@Example.com',
      expect.any(String),
      expect.stringContaining('KoraLink'),
      expect.any(String),
    );
  });

  it('send blocked by cooldown (429)', async () => {
    const { service, emailSender } = setup({
      otpStore: { isCooldownActive: jest.fn().mockResolvedValue(true) },
    });
    await expect(service.requestEmailOtp('a@b.com')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('send blocked by daily cap (429)', async () => {
    const { service, emailSender } = setup({
      otpStore: { getDailyCount: jest.fn().mockResolvedValue(10) },
    });
    await expect(service.requestEmailOtp('a@b.com')).rejects.toBeInstanceOf(HttpException);
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('send blocked by per-IP daily cap (429)', async () => {
    const { service, emailSender } = setup({
      otpStore: { getIpDailyCount: jest.fn().mockResolvedValue(50) },
    });
    await expect(service.requestEmailOtp('a@b.com', '1.2.3.4')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('send blocked for soft-deleted account (403) — no email dispatched', async () => {
    const { service, emailSender } = setup({
      userRow: { ...BASE_USER, deleted_at: new Date() },
    });
    await expect(service.requestEmailOtp('user@example.com')).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
    expect(emailSender.send).not.toHaveBeenCalled();
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

describe('BrevoService', () => {
  function make(configGet: (k: string) => string | undefined) {
    const config = { get: configGet };
    return new BrevoService(config as never);
  }

  it('logs instead of sending when BREVO_API_KEY is empty', async () => {
    const svc = make(() => undefined);
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    await svc.send('a@b.com', 's', '<p>x</p>', '123456');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('503s when key present but BREVO_FROM missing (no shared fallback sender)', async () => {
    const svc = make((k) => (k === 'BREVO_API_KEY' ? 'brevo_key' : undefined));
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    await expect(svc.send('a@b.com', 's', '<p>x</p>')).rejects.toBeInstanceOf(HttpException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to Brevo API with parsed sender when key + from present', async () => {
    const svc = make((k) =>
      k === 'BREVO_API_KEY' ? 'brevo_key' : k === 'BREVO_FROM' ? 'KoraLink <no-reply@koralink.sa>' : undefined,
    );
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as never;
    await svc.send('a@b.com', 's', '<p>x</p>', '123456');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.brevo.com/api/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'brevo_key' }),
      }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({
      sender: { name: 'KoraLink', email: 'no-reply@koralink.sa' },
      to: [{ email: 'a@b.com' }],
      subject: 's',
      htmlContent: '<p>x</p>',
    });
  });

  it('throws 503 when provider rejects', async () => {
    const svc = make((k) =>
      k === 'BREVO_API_KEY' ? 'brevo_key' : k === 'BREVO_FROM' ? 'KoraLink <no-reply@koralink.sa>' : undefined,
    );
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'err' });
    await expect(svc.send('a@b.com', 's', '<p>x</p>')).rejects.toBeInstanceOf(HttpException);
  });
});

describe('parseFromAddress', () => {
  it('parses "Name <addr>" form and strips quotes', () => {
    expect(parseFromAddress('KoraLink <no-reply@koralink.sa>')).toEqual({
      name: 'KoraLink',
      email: 'no-reply@koralink.sa',
    });
    expect(parseFromAddress('"KoraLink App" <no-reply@koralink.sa>')).toEqual({
      name: 'KoraLink App',
      email: 'no-reply@koralink.sa',
    });
  });

  it('falls back to a default display name for bare addresses', () => {
    expect(parseFromAddress('no-reply@koralink.sa')).toEqual({
      name: 'KoraLink',
      email: 'no-reply@koralink.sa',
    });
  });
});

describe('EMAIL_SENDER_PROVIDER factory', () => {
  const makeConfig = (env: Record<string, string | undefined>) =>
    ({ get: (k: string) => env[k] }) as never;

  it('defaults to ResendService when EMAIL_PROVIDER is unset', () => {
    const sender = EMAIL_SENDER_PROVIDER.useFactory(makeConfig({}));
    expect(sender).toBeInstanceOf(ResendService);
  });

  it('selects ResendService for EMAIL_PROVIDER=resend', () => {
    const sender = EMAIL_SENDER_PROVIDER.useFactory(
      makeConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_key' }),
    );
    expect(sender).toBeInstanceOf(ResendService);
  });

  it('selects BrevoService for EMAIL_PROVIDER=brevo (any case/whitespace)', () => {
    const sender = EMAIL_SENDER_PROVIDER.useFactory(
      makeConfig({ EMAIL_PROVIDER: ' Brevo ', BREVO_API_KEY: 'b_key', BREVO_FROM: 'K <n@k.sa>' }),
    );
    expect(sender).toBeInstanceOf(BrevoService);
  });
});
