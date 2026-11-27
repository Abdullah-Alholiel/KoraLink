import { push_subscriptions } from '../../database/schema';
import { NotificationsService } from './notifications.service';

/**
 * P2-416 (run #235) — cross-account push-subscription leak.
 *
 * `subscribe()` upserts on the unique `endpoint`. On a shared device the same
 * endpoint is re-registered when account B enables push after account A. The
 * conflict `set` MUST re-bind `user_id` to the incoming user, otherwise the
 * row stays owned by A: B never gets pushes and A's pushes land on B's
 * session (same class as PR #149).
 *
 * DB stubbed — asserts the drizzle insert/onConflictDoUpdate call shape.
 */
describe('NotificationsService P2-416 subscribe() re-binds user_id on endpoint conflict', () => {
  type Conflict = { target?: unknown; set?: Record<string, unknown> };

  function makeDb() {
    const calls: Array<{ table: unknown; values?: Record<string, unknown>; conflict?: Conflict }> = [];
    const db = {
      insert: (table: unknown) => {
        const call: { table: unknown; values?: Record<string, unknown>; conflict?: Conflict } = { table };
        calls.push(call);
        return {
          values: (values: Record<string, unknown>) => {
            call.values = values;
            return {
              onConflictDoUpdate: (conflict: Conflict) => {
                call.conflict = conflict;
                return Promise.resolve([]);
              },
            };
          },
        };
      },
    };
    return { db, calls };
  }

  function makeService(db: unknown) {
    const config = {
      get: (_key: string, defaultValue?: string) => defaultValue,
    };
    return new NotificationsService(db as never, config as never);
  }

  const sub = {
    endpoint: 'https://fcm.googleapis.com/ep-shared-device',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  };

  it('conflict set includes user_id equal to the incoming userId', async () => {
    const { db, calls } = makeDb();
    const svc = makeService(db);

    const res = await svc.subscribe('user-b', sub as never, 'UA/1.0', 'en');

    expect(res).toEqual({ subscribed: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(push_subscriptions);
    expect(calls[0].values?.user_id).toBe('user-b');
    expect(calls[0].conflict?.target).toEqual([push_subscriptions.endpoint]);
    expect(calls[0].conflict?.set).toEqual(
      expect.objectContaining({
        user_id: 'user-b',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        user_agent: 'UA/1.0',
        locale: 'en',
        updated_at: expect.any(Date),
      }),
    );
  });

  it('re-registration of the same endpoint under a second account re-binds to that account', async () => {
    const { db, calls } = makeDb();
    const svc = makeService(db);

    await svc.subscribe('user-a', sub as never);
    await svc.subscribe('user-b', sub as never);

    expect(calls).toHaveLength(2);
    expect(calls[0].conflict?.set?.user_id).toBe('user-a');
    expect(calls[1].conflict?.set?.user_id).toBe('user-b');
  });
});
