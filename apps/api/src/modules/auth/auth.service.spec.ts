import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpStoreService } from './otp-store.service';

describe('AuthService OTP abuse protection', () => {
  function setup(overrides: {
    isCooldownActive?: jest.Mock;
    getDailyCount?: jest.Mock;
    getIpDailyCount?: jest.Mock;
    incrementIpDaily?: jest.Mock;
    getOtp?: jest.Mock;
    getFailCount?: jest.Mock;
  } = {}) {
    const otpStore = {
      isCooldownActive:
        overrides.isCooldownActive ?? jest.fn().mockResolvedValue(false),
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
      getFailCount: overrides.getFailCount ?? jest.fn().mockResolvedValue(0),
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
      get: jest.fn((key: string) => (key === 'JWT_EXPIRY' ? '7d' : undefined)),
    };
    const unifonic = { sendSms: jest.fn().mockResolvedValue(undefined) };

    const service = new AuthService(
      db as never,
      jwt as never,
      config as never,
      unifonic as never,
      otpStore as never,
    );

    return { service, otpStore, unifonic };
  }

  it('sendOtp throws 429 when resend cooldown is active', async () => {
    const { service, unifonic } = setup({
      isCooldownActive: jest.fn().mockResolvedValue(true),
    });
    const err = await service.sendOtp('+966500000001').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(unifonic.sendSms).not.toHaveBeenCalled();
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
    await service.sendOtp('+966****0001');
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
    const err = await service.sendOtp('+966****0001', '203.0.113.5').catch(
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
    await service.sendOtp('+966****0001', '203.0.113.5');
    expect(otpStore.incrementIpDaily).toHaveBeenCalledWith('203.0.113.5');
  });

  it('sendOtp works without an IP argument (per-IP cap is skipped)', async () => {
    const { service, otpStore, unifonic } = setup();
    await service.sendOtp('+966****0001');
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
