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
                : undefined,
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
        endpoint: 'ep-muted',
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
        endpoint: 'ep-quiet',
        p256dh: 'k',
        auth: 'a',
        locale: 'en',
        push_muted: false,
        quiet_enabled: true,
        quiet_start: 0,
        quiet_end: 23, // window covers all Riyadh hours
      },
    ]);
    const sent = await svc.sendPushToUsers(['u1'], PAYLOAD);
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('delivers to unrestricted users (control case)', async () => {
    const { svc } = makeService([
      {
        endpoint: 'ep-active',
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
