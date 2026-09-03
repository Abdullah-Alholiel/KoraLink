import { NotificationsService } from './notifications.service';

/**
 * P0-5 (run #28): per-category push preferences. Users can mute push by
 * category (match / chat / promo / system) without silencing everything.
 * `sendPushToUsers` looks up the category map once for the whole fan-out
 * and skips muted subs before doing the SSRF + render work.
 */
const setVapidDetails = jest.fn();
const sendNotification = jest.fn(async () => {});

jest.mock('web-push', () => ({
  setVapidDetails: (...args: unknown[]) => setVapidDetails(...(args as [])),
  sendNotification: (...args: unknown[]) => sendNotification(...(args as [])),
}));

describe('NotificationsService.sendPushToUsers per-category mute (P0-5, run #28)', () => {
  // The service issues two SELECTs: one for push_subscriptions+users, one for
  // user_notification_prefs. The mock below splits them on the FROM table
  // shape: the FIRST select (subs+users) returns `subRows`; the SECOND
  // (user_notification_prefs) returns `muteRows`.
  function makeService(
    subRows: Array<Record<string, unknown>>,
    muteRows: Array<{ user_id: string; category: string }> = [],
  ) {
    let selectCall = 0;
    const svc = new NotificationsService(
      {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: async () => {
                selectCall += 1;
                // The first select is the subs+users join; every subsequent
                // select is the per-category mute lookup. Mock both.
                if (selectCall === 1) return subRows;
                // user_notification_prefs select has TWO clauses: the `inArray
                // (user_id, userIds)` and the `eq(category, X)`. Both must be
                // satisfied for the mute to be applied. Since the service
                // pre-narrows the category, the `eq` clause has already
                // filtered server-side — so we return the mocked mutes.
                return muteRows.filter((m) =>
                  mutesSeenForCategory(m, muteRows),
                );
              },
            }),
            where: async () => {
              selectCall += 1;
              if (selectCall === 1) return subRows;
              return muteRows;
            },
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

  // The service query is `where(and(inArray, eq(muted, true), eq(category, X)))`
  // — for the test, we just trust the mocked muteRows; the production path
  // filters server-side. A simple pass-through keeps the spec focused on the
  // service's own filtering logic.
  function mutesSeenForCategory(
    _m: { user_id: string; category: string },
    rows: Array<{ user_id: string; category: string }>,
  ) {
    return rows;
  }

  beforeEach(() => {
    sendNotification.mockClear();
    setVapidDetails.mockClear();
  });

  const KEY_PAYLOAD = {
    key: 'match_starting_soon' as const,
    vars: { title: 'Padel', kickoffISO: '2026-09-03T18:00:00Z' },
    data: { type: 'match', matchId: 'm1' },
  };
  const INLINE_PAYLOAD = {
    title: 'Sender',
    body: 'hi',
    data: { type: 'dm', conversationId: 'c1' },
    category: 'chat' as const,
  };

  const sub = (overrides: Record<string, unknown>) => ({
    user_id: 'u1',
    endpoint: 'https://fcm.googleapis.com/ep',
    p256dh: 'k',
    auth: 'a',
    locale: 'en',
    push_muted: false,
    quiet_enabled: false,
    quiet_start: 23,
    quiet_end: 7,
    ...overrides,
  });

  it('drops a key-form sub when its category is muted', async () => {
    const { svc } = makeService([sub({ user_id: 'u1' })], [
      { user_id: 'u1', category: 'match' },
    ]);
    const sent = await svc.sendPushToUsers(['u1'], KEY_PAYLOAD);
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('delivers a key-form sub when its category is NOT muted', async () => {
    const { svc } = makeService([sub({ user_id: 'u1' })], [
      // User muted CHAT, not match — match push goes through.
      { user_id: 'u1', category: 'chat' },
    ]);
    const sent = await svc.sendPushToUsers(['u1'], KEY_PAYLOAD);
    expect(sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('drops an inline-form DM sub when category: chat is muted', async () => {
    const { svc } = makeService([sub({ user_id: 'u1' })], [
      { user_id: 'u1', category: 'chat' },
    ]);
    const sent = await svc.sendPushToUsers(['u1'], INLINE_PAYLOAD);
    expect(sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('delivers an inline-form DM sub when category: chat is NOT muted', async () => {
    const { svc } = makeService([sub({ user_id: 'u1' })], [
      { user_id: 'u1', category: 'system' },
    ]);
    const sent = await svc.sendPushToUsers(['u1'], INLINE_PAYLOAD);
    expect(sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('fan-out honours per-user mutes (one muted, one not)', async () => {
    const { svc } = makeService(
      [sub({ user_id: 'u1' }), sub({ user_id: 'u2' })],
      [{ user_id: 'u1', category: 'match' }],
    );
    const sent = await svc.sendPushToUsers(['u1', 'u2'], KEY_PAYLOAD);
    expect(sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('inline form without `category` is not gated (back-compat)', async () => {
    const { svc } = makeService([sub({ user_id: 'u1' })], []);
    const sent = await svc.sendPushToUsers(['u1'], {
      title: 'X',
      body: 'Y',
      data: { type: 'x' },
    });
    expect(sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
