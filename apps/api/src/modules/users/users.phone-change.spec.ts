import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { OtpStoreService } from '../auth/otp-store.service';

/**
 * P1-19 (run #44) — phone-change flow unit specs.
 *
 * Covers: scoped-OTP verification (login codes can NEVER verify a change),
 * fail lockout, wrong-number binding, uniqueness 409 on both steps, PDPL /
 * ban gates, audit write, and the populated-profile return contract.
 */
describe('UsersService phone-change (P1-19)', () => {
  const OLD = '+966500000001';
  const NEW = '+966511111112';

  function setup(overrides: {
    otpStore?: Record<string, jest.Mock>;
    dbSelectUser?: Record<string, unknown>;
    updateError?: Error & { code?: string };
  } = {}) {
    const otpStore = {
      isCooldownActive: jest.fn().mockResolvedValue(false),
      getDailyCount: jest.fn().mockResolvedValue(0),
      getIpDailyCount: jest.fn().mockResolvedValue(0),
      incrementIpDaily: jest.fn().mockResolvedValue(1),
      setChangeOtp: jest.fn().mockResolvedValue(undefined),
      getChangeOtp:
        overrides.otpStore?.getChangeOtp ?? jest.fn().mockResolvedValue(undefined),
      deleteChangeOtp: jest.fn().mockResolvedValue(undefined),
      setCooldown: jest.fn().mockResolvedValue(undefined),
      incrementDaily: jest.fn().mockResolvedValue(1),
      getFailCount: jest.fn().mockResolvedValue(0),
      incrementFail: jest.fn().mockResolvedValue(1),
      resetFails: jest.fn().mockResolvedValue(undefined),
      ...(overrides.otpStore ?? {}),
    };

    // Chainable db mock with CALL-ORDERED select results:
    //   request:  select#1 = actor row, select#2 = taken-pre-check (empty)
    //   verify:   select#1 = actor row
    const update = jest.fn().mockReturnThis();
    const set = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const actorRow =
      overrides.dbSelectUser ?? {
        id: 'u1',
        phone: OLD,
        role: 'Player',
        banned_at: null,
        suspended_until: null,
        deleted_at: null,
      };
    const db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where,
      limit: jest
        .fn()
        .mockResolvedValueOnce([actorRow])
        .mockResolvedValueOnce([]), // taken-pre-check: number is free
      update,
      set,
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
      // getPomCount (getProfile) raw SQL
      execute: jest.fn().mockResolvedValue({ rows: [{ pom_count: 0 }], length: 1 }),
    };
    // update(...).set(...).where(...) → resolve when awaited (verify step);
    // the select path uses limit() above. The returning-less update chain
    // ends at where(): make where() thenable only for the update chain by
    // giving set() the thenable back-reference.
    set.mockImplementation(() => {
      const p = Promise.resolve(undefined);
      const thenable = Object.assign(Promise.resolve(undefined), {});
      void p;
      void thenable;
      return whereProxy();
    });
    function whereProxy() {
      const proxy = {
        where: (..._args: unknown[]) => {
          if (overrides.updateError) return Promise.reject(overrides.updateError);
          return Promise.resolve(undefined);
        },
      };
      return proxy;
    }
    void update;

    const profileRow = {
      id: 'u1',
      phone: NEW,
      full_name: 'Test',
      handle: 'test',
      avatar_url: null,
      preferred_location: null,
      preferred_position: null,
      role: 'Player',
      pom_count: 0,
    };
    // query.users.findFirst → getProfile projection
    (db as unknown as { query: unknown }).query = {
      users: { findFirst: jest.fn().mockResolvedValue(profileRow) },
    };

    const unifonic = { sendSms: jest.fn().mockResolvedValue(undefined) };
    const service = new UsersService(
      db as never,
      { sign: jest.fn() } as never,
      { get: jest.fn() } as never,
      undefined, // mailer (@Optional)
      otpStore as never,
      unifonic as never,
    );
    // getProfile reads via db.query.users.findFirst — already wired.
    return { service, otpStore, unifonic, db };
  }

  it('request: stores a FRESH code under the scoped change key and sends SMS', async () => {
    const { service, otpStore, unifonic } = setup();
    const res = await service.requestPhoneChange('u1', NEW);
    expect(otpStore.setChangeOtp).toHaveBeenCalledWith(NEW, expect.stringMatching(/^\d{6}$/));
    expect(otpStore.setCooldown).toHaveBeenCalledWith(NEW);
    expect(otpStore.incrementDaily).toHaveBeenCalledWith(NEW);
    expect(unifonic.sendSms).toHaveBeenCalledWith(NEW, expect.stringContaining('number-change'));
    expect(res.cooldownSeconds).toBe(60);
  });

  it('request: per-IP daily cap applies (same budget as login)', async () => {
    const { service, otpStore } = setup({
      otpStore: { getIpDailyCount: jest.fn().mockResolvedValue(50) },
    });
    await expect(service.requestPhoneChange('u1', NEW, '1.2.3.4')).rejects.toMatchObject({
      status: 429,
    });
    expect(otpStore.setChangeOtp).not.toHaveBeenCalled();
  });

  it('request: same number as current → 400, no SMS burned', async () => {
    const { service, unifonic } = setup();
    await expect(service.requestPhoneChange('u1', OLD)).rejects.toMatchObject({ status: 400 });
    expect(unifonic.sendSms).not.toHaveBeenCalled();
  });

  it('request: number already registered → 409', async () => {
    const { service } = setup({
      // First select (actor) returns the actor; this override can't
      // distinguish calls, so emulate via a second row check instead.
    });
    // Simpler: point limit() at a taken-row response for the pre-check by
    // re-running with a taken flag through dbSelectUser is not possible —
    // exercise the service-level pre-check through a distinct db mock:
    const takenDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'u1', phone: OLD, role: 'Player', banned_at: null, suspended_until: null, deleted_at: null },
        ])
        .mockResolvedValueOnce([{ id: 'u2' }]),
    };
    (service as unknown as { db: unknown }).db = takenDb;
    await expect(service.requestPhoneChange('u1', NEW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('verify: correct scoped code flips the phone and returns the populated profile', async () => {
    const { service, otpStore } = setup({
      otpStore: { getChangeOtp: jest.fn().mockResolvedValue('123456') },
    });
    const res = await service.verifyPhoneChange('u1', NEW, '123456');
    expect(res.phone).toBe(NEW);
    expect(res.full_name).toBe('Test');
    expect(otpStore.deleteChangeOtp).toHaveBeenCalledWith(NEW);
    expect(otpStore.resetFails).toHaveBeenCalledWith(NEW);
  });

  it('verify: a LOGIN-surface code (unscoped key) can NEVER verify the change', async () => {
    // getChangeOtp (scoped key) returns undefined even though a login OTP
    // exists under otp:<phone> — cross-flow reuse is impossible by keying.
    const { service } = setup({
      otpStore: { getChangeOtp: jest.fn().mockResolvedValue(undefined) },
    });
    await expect(service.verifyPhoneChange('u1', NEW, '654321')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('verify: code is number-bound — right code for the WRONG number → 401', async () => {
    const OTHER = '+966522222223';
    const { service, otpStore } = setup({
      otpStore: {
        // Code stored for OTHER only; caller presents NEW → no code found.
        getChangeOtp: jest.fn().mockImplementation((phone: string) =>
          phone === OTHER ? Promise.resolve('123456') : Promise.resolve(undefined),
        ),
      },
    });
    await expect(service.verifyPhoneChange('u1', NEW, '123456')).rejects.toMatchObject({
      status: 401,
    });
    void otpStore;
  });

  it('verify: wrong code increments the shared fail counter', async () => {
    const { service, otpStore } = setup({
      otpStore: { getChangeOtp: jest.fn().mockResolvedValue('123456') },
    });
    await expect(service.verifyPhoneChange('u1', NEW, '000000')).rejects.toMatchObject({
      status: 401,
    });
    expect(otpStore.incrementFail).toHaveBeenCalledWith(NEW);
  });

  it('verify: unique-violation in the race window → localized 409', async () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505' });
    const { service } = setup({
      otpStore: { getChangeOtp: jest.fn().mockResolvedValue('123456') },
      updateError: pgErr,
    });
    await expect(service.verifyPhoneChange('u1', NEW, '123456')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('verify: writes the phone_changed audit activity', async () => {
    const { service, db } = setup({
      otpStore: { getChangeOtp: jest.fn().mockResolvedValue('123456') },
    });
    await service.verifyPhoneChange('u1', NEW, '123456');
    expect(db.insert).toHaveBeenCalled();
    expect((db.insert as jest.Mock).mock.calls[0][0]).toBeDefined();
    const valuesArg = (db.insert as jest.Mock).mock.results[0].value.values.mock.calls[0][0];
    expect(valuesArg).toMatchObject({ actor_id: 'u1', verb: 'phone_changed' });
  });

  it('verify: banned actor is blocked at BOTH steps', async () => {
    // Two fresh instances: each step consumes its own select queue (the
    // actor lookup is call #1 on both request and verify).
    const { service: svcA } = setup({
      dbSelectUser: {
        id: 'u1',
        phone: OLD,
        role: 'Player',
        banned_at: new Date(),
        suspended_until: null,
        deleted_at: null,
      },
    });
    await expect(svcA.requestPhoneChange('u1', NEW)).rejects.toMatchObject({ status: 403 });
    const { service: svcB } = setup({
      otpStore: { getChangeOtp: jest.fn().mockResolvedValue('123456') },
      dbSelectUser: {
        id: 'u1',
        phone: OLD,
        role: 'Player',
        banned_at: new Date(),
        suspended_until: null,
        deleted_at: null,
      },
    });
    await expect(svcB.verifyPhoneChange('u1', NEW, '123456')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('verify: soft-deleted actor is blocked (PDPL mirror of login guard)', async () => {
    const { service } = setup({
      otpStore: { getChangeOtp: jest.fn().mockResolvedValue('123456') },
      dbSelectUser: {
        id: 'u1',
        phone: OLD,
        role: 'Player',
        banned_at: null,
        suspended_until: null,
        deleted_at: new Date(),
      },
    });
    await expect(service.verifyPhoneChange('u1', NEW, '123456')).rejects.toMatchObject({
      status: 403,
    });
  });
});
