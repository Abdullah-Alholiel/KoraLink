import { NotificationsService } from './notifications.service';

/**
 * P1-20 (run #13): push delivery preferences. Pushes previously broadcast to
 * every subscriber with zero per-user controls — Saudi users could get
 * night-time pushes. This spec pins the quiet-hours math (Riyadh-local,
 * midnight-wrapping windows) and the per-user skip paths in
 * sendPushToUsers (muted users, in-window users → zero sends).
 */
const setVapidDetails = jest.fn();
const sendNotification = jest.fn(async () => {});

jest.mock('web-push', () => ({
  setVapidDetails: (...args: unknown[]) => setVapidDetails(...(args as [])),
  sendNotification: (...args: unknown[]) => sendNotification(...(args as [])),
}));

describe('NotificationsService.isInQuietHours (P1-20)', () => {
  // Riyadh is UTC+3 (no DST): 20:00 UTC === 23:00 Riyadh.
  const riyadh = (utcHour: number) =>
    new Date(`2026-08-29T${String(utcHour).padStart(2, '0')}:00:00Z`);

  it('suppresses inside a NON-wrapping window (13→18)', () => {
    // 14:00 Riyadh === 11:00 UTC
    expect(NotificationsService.isInQuietHours(riyadh(11), 13, 18)).toBe(true);
    // 12:00 Riyadh === 09:00 UTC (before window)
    expect(NotificationsService.isInQuietHours(riyadh(9), 13, 18)).toBe(false);
    // 18:00 Riyadh === 15:00 UTC (end is exclusive)
    expect(NotificationsService.isInQuietHours(riyadh(15), 13, 18)).toBe(false);
  });

  it('suppresses inside a MIDNIGHT-WRAPPING window (23→07)', () => {
    // 23:00 Riyadh === 20:00 UTC
    expect(NotificationsService.isInQuietHours(riyadh(20), 23, 7)).toBe(true);
    // 03:00 Riyadh === 00:00 UTC
    expect(NotificationsService.isInQuietHours(riyadh(0), 23, 7)).toBe(true);
    // 06:00 Riyadh === 03:00 UTC
    expect(NotificationsService.isInQuietHours(riyadh(3), 23, 7)).toBe(true);
    // 07:00 Riyadh === 04:00 UTC — window ends (end exclusive)
    expect(NotificationsService.isInQuietHours(riyadh(4), 23, 7)).toBe(false);
    // 12:00 Riyadh === 09:00 UTC
    expect(NotificationsService.isInQuietHours(riyadh(9), 23, 7)).toBe(false);
  });

  it('treats start === end as always quiet', () => {
    expect(NotificationsService.isInQuietHours(riyadh(9), 14, 14)).toBe(true);
    expect(NotificationsService.isInQuietHours(riyadh(22), 14, 14)).toBe(true);
  });
});

describe('NotificationsService.sendPushToUsers preference filtering (P1-20)', () => {
  const PAYLOAD = {
    title: '📣 Players needed',
    body: 'test',
    data: { type: 'match-chat', matchId: 'm1' },
  };

  function makeService(rows: Array<Record<string, unknown>>) {
    const svc = new NotificationsService(
      {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: async () => rows,
            }),
          }),
        }),
        delete: () => ({
          where: async () => [],
        }),
      } as never,
      // Any non-empty key pair ⇒ vapidConfigured = true (module is mocked).
      {
        get: (key: string) =>
          key === 'VAPID_PUBLIC_KEY'
            ? 'pub'
            : key === 'VAPID_PRIVATE_KEY'
              ? 'priv'
              : key === 'VAPID_SUBJECT'
                ? 'mailto:t@example.com'
                : '',
      } as never,
    );
    return { svc };
  }

  beforeEach(() => {
    sendNotification.mockClear();
    setVapidDetails.mockClear();
  });

  it('skips muted users entirely', async () => {
    const { svc } = makeService([
      {
        endpoint: 'https://fcm.googleapis.com/ep-muted',
        p256dh: 'k',
        auth: 'a',
        locale: 'en',
        push_muted: true,
        quiet_enabled: false,
        quiet_start: 23,
        quiet_end: 7,
      },
    ]);
    const sent = await svc.sendPushToUsers(['u1'], PAYLOAD);
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('skips users inside their enabled quiet-hours window', async () => {
    const { svc } = makeService([
      {
        endpoint: 'https://fcm.googleapis.com/ep-quiet',
        p256dh: 'k',
        auth: 'a',
        locale: 'en',
        push_muted: false,
        quiet_enabled: true,
        quiet_start: 0,
        quiet_end: 0, // 0→0 = muted 24/7 (end-exclusive; hour 23 is NOT inside 0→23)
      },
    ]);
    const sent = await svc.sendPushToUsers(['u1'], PAYLOAD);
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('delivers to unrestricted users (control case)', async () => {
    const { svc } = makeService([
      {
        endpoint: 'https://fcm.googleapis.com/ep-active',
        p256dh: 'k',
        auth: 'a',
        locale: 'en',
        push_muted: false,
        quiet_enabled: false,
        quiet_start: 23,
        quiet_end: 7,
      },
    ]);
    const sent = await svc.sendPushToUsers(['u1'], PAYLOAD);
    expect(sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsService.sendPomDecidedNotification preference filtering (P2-27, run #17)', () => {
  /**
   * P2-27: POTM pushes previously iterated raw match subscriptions and sent
   * unconditionally — the only push path ignoring push_muted/quiet hours.
   * Now routed through sendPushToUsers, so the same per-user preferences apply.
   */
  function makePomService(
    rosterRows: Array<{ user_id: string }>,
    subRows: Array<Record<string, unknown>>,
  ) {
    const svc = new NotificationsService(
      {
        selectDistinct: () => ({
          from: () => ({
            where: async () => rosterRows,
          }),
        }),
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: async () => subRows,
            }),
          }),
        }),
        delete: () => ({
          where: async () => [],
        }),
      } as never,
      {
        get: (key: string) =>
          key === 'VAPID_PUBLIC_KEY'
            ? 'pub'
            : key === 'VAPID_PRIVATE_KEY'
              ? 'priv'
              : key === 'VAPID_SUBJECT'
                ? 'mailto:t@example.com'
                : '',
      } as never,
    );
    return { svc };
  }

  const POM_PAYLOAD = {
    matchId: 'm1',
    winner: { id: 'w1', fullName: 'Saud Al-Otaibi', avatarUrl: null },
    voteCount: 3,
  };

  beforeEach(() => {
    sendNotification.mockClear();
  });

  it('skips muted roster users', async () => {
    const { svc } = makePomService([{ user_id: 'u1' }], [
      {
        endpoint: 'https://fcm.googleapis.com/ep-pom-muted',
        p256dh: 'k',
        auth: 'a',
        locale: 'en',
        push_muted: true,
        quiet_enabled: false,
        quiet_start: 23,
        quiet_end: 7,
      },
    ]);
    const sent = await svc.sendPomDecidedNotification('m1', POM_PAYLOAD);
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('skips roster users inside their quiet-hours window', async () => {
    const { svc } = makePomService([{ user_id: 'u1' }], [
      {
        endpoint: 'https://fcm.googleapis.com/ep-pom-quiet',
        p256dh: 'k',
        auth: 'a',
        locale: 'en',
        push_muted: false,
        quiet_enabled: true,
        quiet_start: 0,
        quiet_end: 0, // 0→0 = muted 24/7 (end-exclusive; hour 23 is NOT inside 0→23)
      },
    ]);
    const sent = await svc.sendPomDecidedNotification('m1', POM_PAYLOAD);
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('delivers to unrestricted roster users with per-subscription locale and no winnerId', async () => {
    const { svc } = makePomService([{ user_id: 'u1' }], [
      {
        endpoint: 'https://fcm.googleapis.com/ep-pom-active',
        p256dh: 'k',
        auth: 'a',
        locale: 'ar',
        push_muted: false,
        quiet_enabled: false,
        quiet_start: 23,
        quiet_end: 7,
      },
    ]);
    const sent = await svc.sendPomDecidedNotification('m1', POM_PAYLOAD);
    expect(sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const sendMock = sendNotification as unknown as jest.Mock;
    const body = JSON.parse(sendMock.mock.calls[0][1] as string);
    // P2-8 (run #24): the 'ar' subscription now gets ARABIC text, not English.
    expect(body.title).toBe('🏆 أفضل لاعب في المباراة');
    expect(body.body).toContain('Saud Al-Otaibi'); // winner name interpolated as-is
    expect(body.data.type).toBe('pom-decided');
    expect(body.data.matchId).toBe('m1');
    expect(body.data.locale).toBe('ar'); // P1-5: deep-link keeps the subscriber's locale
    expect(body.data.winnerId).toBeUndefined(); // dead field dropped (0 PWA consumers)
  });

  it('localizes key-form pushes per subscription locale (P2-8, run #24)', async () => {
    const { svc } = makePomService([{ user_id: 'u1' }], [
      {
        endpoint: 'https://fcm.googleapis.com/ep-pom-active',
        p256dh: 'k',
        auth: 'a',
        locale: 'en',
        push_muted: false,
        quiet_enabled: false,
        quiet_start: 23,
        quiet_end: 7,
      },
    ]);
    await svc.sendPomDecidedNotification('m1', POM_PAYLOAD);
    const sendMock = sendNotification as unknown as jest.Mock;
    const body = JSON.parse(sendMock.mock.calls[0][1] as string);
    expect(body.title).toBe('🏆 Player of the Match'); // en subscription → English
    expect(body.data.locale).toBe('en');
  });

  it('legacy title/body pushes stay byte-identical (P2-8 compat branch)', async () => {
    const { svc } = makePomService([{ user_id: 'u-legacy' }], [
      {
        endpoint: 'https://fcm.googleapis.com/ep-legacy',
        p256dh: 'k',
        auth: 'a',
        locale: 'ar',
        push_muted: false,
        quiet_enabled: false,
        quiet_start: 23,
        quiet_end: 7,
      },
    ]);
    await svc.sendPushToUsers(['u-legacy'], {
      title: 'Khalid Al-Otaibi',
      body: 'marhaba',
      data: { type: 'dm', conversationId: 'c1' },
    });
    const sendMock = sendNotification as unknown as jest.Mock;
    const body = JSON.parse(sendMock.mock.calls[0][1] as string);
    expect(body.title).toBe('Khalid Al-Otaibi'); // DM text is locale-neutral — never rewritten
    expect(body.body).toBe('marhaba');
    expect(body.data.locale).toBe('ar'); // deep-link locale still injected
  });
});
