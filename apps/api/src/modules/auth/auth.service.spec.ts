import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpStoreService } from './otp-store.service';
import { assertNoSecrets } from '../../common/utils/pii-safe-logging';

describe('AuthService OTP abuse protection', () => {
  function setup(overrides: {
    nodeEnv?: string;
    smsConfigured?: boolean;
    isCooldownActive?: jest.Mock;
    getCooldownRemaining?: jest.Mock;
    getDailyCount?: jest.Mock;
    getIpDailyCount?: jest.Mock;
    incrementIpDaily?: jest.Mock;
    getOtp?: jest.Mock;
    getFailCount?: jest.Mock;
    getLockoutRemaining?: jest.Mock;
  } = {}) {
    const otpStore = {
      isCooldownActive:
        overrides.isCooldownActive ?? jest.fn().mockResolvedValue(false),
      // P2-194: cooldown 429s carry retryAfter seconds
      getCooldownRemaining:
        overrides.getCooldownRemaining ?? jest.fn().mockResolvedValue(0),
      getDailyCount: overrides.getDailyCount ?? jest.fn().mockResolvedValue(0),
      setOtp: jest.fn().mockResolvedValue(undefined),
      setCooldown: jest.fn().mockResolvedValue(undefined),
      incrementDaily: jest.fn().mockResolvedValue(1),
      // P2-19 (run #27): per-IP daily counter
      getIpDailyCount:
        overrides.getIpDailyCount ?? jest.fn().mockResolvedValue(0),
      incrementIpDaily:
        overrides.incrementIpDaily ?? jest.fn().mockResolvedValue(1),
      getOtp: overrides.getOtp ?? jest.fn().mockResolvedValue(undefined),
      deleteOtp: jest.fn().mockResolvedValue(undefined),
      // Run-#53: mutex pass-through — the real OtpStoreService serializes the
      // fn per key; the mock just runs it inline.
      withVerifyLock: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
      getFailCount: overrides.getFailCount ?? jest.fn().mockResolvedValue(0),
      // P2-198 (run #131): lockout-deadline read powering the 429 retryAfter
      getLockoutRemaining:
        overrides.getLockoutRemaining ?? jest.fn().mockResolvedValue(0),
      incrementFail: jest.fn().mockResolvedValue(1),
      resetFails: jest.fn().mockResolvedValue(undefined),
    };

    const db = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        { id: 'u1', phone: '+966500000001', full_name: 'Abdullah', role: 'player' },
      ]),
    };

    const jwt = { sign: jest.fn().mockReturnValue('signed-token') };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_EXPIRY') return '7d';
        if (key === 'NODE_ENV') return overrides.nodeEnv;
        return undefined;
      }),
    };
    const unifonic = {
      sendSms: jest.fn().mockResolvedValue(undefined),
      // 2026-11-16 P0: the fail-closed gate reads isConfigured().
      isConfigured: jest
        .fn()
        .mockReturnValue(overrides.smsConfigured ?? true),
    };

    const service = new AuthService(
      db as never,
      jwt as never,
      config as never,
      unifonic as never,
      otpStore as never,
    );

    return { service, otpStore, unifonic, config, db };
  }

  // ── 2026-11-16 owner P0: prod + empty UNIFONIC_APP_SID fails CLOSED ──
  describe('send-otp fail-closed when SMS is unconfigured (SMS_UNAVAILABLE)', () => {
    it.each(['production', 'staging'])(
      'NODE_ENV=%s + unconfigured SMS → 503 SMS_UNAVAILABLE, NOTHING written',
      async (nodeEnv) => {
        const { service, otpStore, unifonic, db } = setup({
          nodeEnv,
          smsConfigured: false,
        });
        const err = await service.sendOtp('+966****0001').catch((e) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect((err as ServiceUnavailableException).getStatus()).toBe(503);
        expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
          code: 'SMS_UNAVAILABLE',
        });
        // No user row, no OTP entry, no cooldown, no counters, no SMS attempt:
        // the channel must be cleanly retryable once the provider is configured.
        expect(db.insert).not.toHaveBeenCalled();
        expect(otpStore.setOtp).not.toHaveBeenCalled();
        expect(otpStore.setCooldown).not.toHaveBeenCalled();
        expect(otpStore.incrementDaily).not.toHaveBeenCalled();
        expect(unifonic.sendSms).not.toHaveBeenCalled();
      },
    );

    it('fake success is dead in prod: the 503 fires BEFORE any DB/cache write', async () => {
      const { service, otpStore, unifonic } = setup({
        nodeEnv: 'production',
        smsConfigured: false,
      });
      await expect(service.sendOtp('+966****0001')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(otpStore.getDailyCount).not.toHaveBeenCalled();
      expect(otpStore.getIpDailyCount).not.toHaveBeenCalled();
      expect(unifonic.sendSms).not.toHaveBeenCalled();
    });

    it.each(['development', 'test'])(
      'NODE_ENV=%s + unconfigured SMS keeps the log-only dev fallback (send proceeds)',
      async (nodeEnv) => {
        const { service, otpStore, unifonic } = setup({
          nodeEnv,
          smsConfigured: false,
        });
        await service.sendOtp('+966****0001');
        expect(otpStore.setOtp).toHaveBeenCalled();
        expect(unifonic.sendSms).toHaveBeenCalled();
      },
    );

    it('configured SMS bypasses the gate even in production', async () => {
      const { service, otpStore, unifonic } = setup({
        nodeEnv: 'production',
        smsConfigured: true,
      });
      await service.sendOtp('+966****0001');
      expect(otpStore.setOtp).toHaveBeenCalled();
      expect(unifonic.sendSms).toHaveBeenCalled();
    });

    // Done-when: "unit tests prove no code or body is ever logged (spy on the
    // logger)". Every log call the service makes is captured and run through
    // the secret scanner — including the cooldown/lockout warn paths, which
    // are the only lines the OTP flow actually emits.
    it('no log line during the whole send/verify flow ever carries a code, body, or raw phone', async () => {
      const { service, otpStore } = setup();
      const logLines: string[] = [];
      const capture =
        (level: string) =>
          jest.fn((message: unknown) => {
            logLines.push(`[${level}] ${String(message)}`);
          });
      const svc = service as unknown as { logger: Record<string, jest.Mock> };
      svc.logger = {
        log: capture('log'),
        warn: capture('warn'),
        error: capture('error'),
        debug: capture('debug'),
        verbose: capture('verbose'),
      };

      await service.sendOtp('+966****0001', '203.0.113.5'); // happy path
      // Cooldown active → the send-otp blocked warn fires.
      (otpStore.getCooldownRemaining as jest.Mock).mockResolvedValue(60);
      await service.sendOtp('+966****0001').catch(() => undefined);
      // Fail lockout reached → the verify-otp blocked warn fires.
      (otpStore.getCooldownRemaining as jest.Mock).mockResolvedValue(0);
      (otpStore.getFailCount as jest.Mock).mockResolvedValue(
        OtpStoreService.FAIL_LIMIT,
      );
      await service.verifyOtp('+966****0001', '000000').catch(() => undefined);

      expect(logLines.length).toBeGreaterThanOrEqual(2); // both blocked warns captured
      for (const line of logLines) {
        expect(assertNoSecrets(line)).toBe(true);
      }
      // The masked phone is the ONLY destination form that may appear.
      expect(logLines.join('\n')).toContain('+966*****001');
    });
  });

  it('sendOtp throws 429 when resend cooldown is active', async () => {
    const { service, unifonic } = setup({
      // P2-194: the gate reads getCooldownRemaining — isCooldownActive is no
      // longer consulted on this path.
      getCooldownRemaining: jest.fn().mockResolvedValue(60),
    });
    const err = await service.sendOtp('+966500000001').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(unifonic.sendSms).not.toHaveBeenCalled();
  });

  // P2-194 (run #129): the cooldown 429 carries retryAfter seconds so the PWA
  // can show an honest "try again in Ns" countdown instead of a blind retry.
  it('sendOtp cooldown 429 body carries retryAfter seconds (P2-194)', async () => {
    const { service } = setup({
      getCooldownRemaining: jest.fn().mockResolvedValue(37),
    });
    const err = await service.sendOtp('+966500000001').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getResponse()).toMatchObject({ retryAfter: 37 });
  });

  it('sendOtp throws 429 when daily cap is reached', async () => {
    const { service, unifonic } = setup({
      getDailyCount: jest.fn().mockResolvedValue(OtpStoreService.DAILY_CAP),
    });
    const err = await service.sendOtp('+966500000001').catch((e) => e);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(unifonic.sendSms).not.toHaveBeenCalled();
  });

  it('sendOtp sends SMS and arms cooldown + daily counter on success', async () => {
    const { service, otpStore, unifonic } = setup();
    await service.sendOtp('+966500000001');
    expect(otpStore.setOtp).toHaveBeenCalled();
    expect(otpStore.setCooldown).toHaveBeenCalled();
    expect(otpStore.incrementDaily).toHaveBeenCalled();
    expect(unifonic.sendSms).toHaveBeenCalled();
  });

  // P2-19 (run #27): per-IP daily cap. A bot net rotating phones against
  // one source IP still drains the Unifonic budget without this gate.
  it('sendOtp throws 429 when per-IP daily cap is reached', async () => {
    const { service, otpStore, unifonic } = setup({
      getIpDailyCount: jest.fn().mockResolvedValue(OtpStoreService.DAILY_IP_CAP),
    });
    const err = await service.sendOtp('+966500000001', '203.0.113.5').catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    // The per-IP cap blocks BEFORE the per-phone cap is incremented —
    // otherwise an attacker would still get their counter ticked.
    expect(otpStore.incrementIpDaily).not.toHaveBeenCalled();
    expect(otpStore.incrementDaily).not.toHaveBeenCalled();
    expect(unifonic.sendSms).not.toHaveBeenCalled();
  });

  it('sendOtp increments the per-IP daily counter on success', async () => {
    const { service, otpStore } = setup();
    await service.sendOtp('+966500000001', '203.0.113.5');
    expect(otpStore.incrementIpDaily).toHaveBeenCalledWith('203.0.113.5');
  });

  it('sendOtp works without an IP argument (per-IP cap is skipped)', async () => {
    const { service, otpStore, unifonic } = setup();
    await service.sendOtp('+966500000001');
    expect(otpStore.getIpDailyCount).not.toHaveBeenCalled();
    expect(otpStore.incrementIpDaily).not.toHaveBeenCalled();
    expect(unifonic.sendSms).toHaveBeenCalled();
  });

  it('verifyOtp throws 429 when locked out', async () => {
    const { service } = setup({
      getFailCount: jest.fn().mockResolvedValue(OtpStoreService.FAIL_LIMIT),
    });
    const err = await service.verifyOtp('+966500000001', '000000').catch((e) => e);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  // P2-198 (run #131): the lockout 429 carries a machine-readable retryAfter.
  it('verifyOtp lockout 429 carries retryAfter from the armed deadline', async () => {
    const { service } = setup({
      getFailCount: jest.fn().mockResolvedValue(OtpStoreService.FAIL_LIMIT),
      getLockoutRemaining: jest.fn().mockResolvedValue(734),
    });
    const err = (await service
      .verifyOtp('+966500000001', '000000')
      .catch((e) => e)) as HttpException;
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((err.getResponse() as { retryAfter?: number }).retryAfter).toBe(734);
  });

  it('verifyOtp lockout 429 degrades to retryAfter 0 without an armed deadline (legacy entries)', async () => {
    const { service } = setup({
      getFailCount: jest.fn().mockResolvedValue(OtpStoreService.FAIL_LIMIT),
      // getLockoutRemaining default mock = 0 (unarmed / pre-P2-198 entry)
    });
    const err = (await service
      .verifyOtp('+966500000001', '000000')
      .catch((e) => e)) as HttpException;
    expect((err.getResponse() as { retryAfter?: number }).retryAfter).toBe(0);
  });

  it('verifyOtp increments fail counter and throws 401 on wrong code', async () => {
    const { service, otpStore } = setup({
      getOtp: jest.fn().mockResolvedValue('123456'),
    });
    const err = await service.verifyOtp('+966500000001', '000000').catch((e) => e);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(otpStore.incrementFail).toHaveBeenCalled();
  });

  it('verifyOtp returns token and resets fails on success', async () => {
    const { service, otpStore } = setup({
      getOtp: jest.fn().mockResolvedValue('123456'),
    });
    const result = await service.verifyOtp('+966500000001', '123456');
    expect(result).toEqual({ token: 'signed-token', isNewUser: false });
    expect(otpStore.deleteOtp).toHaveBeenCalled();
    expect(otpStore.resetFails).toHaveBeenCalled();
  });
});
