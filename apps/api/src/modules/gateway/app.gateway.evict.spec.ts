import { AppGateway } from './app.gateway';

/**
 * P1-70 (security audit run-5 R5-1, fingerprint
 * api-realtime:stale-room-membership-post-removal): join-lobby gates room
 * membership ONCE, so a removed/leaving player's socket stayed in
 * `match:<id>` until disconnect. evictFromMatch drops only the target user's
 * sockets from the room and never throws (removal must not fail on WS).
 */
const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const ROOM = `match:${MATCH_ID}`;
const TARGET = 'user-target';
const OTHER = 'user-other';

type FakeSocket = {
  data?: { userId?: string };
  userId?: string;
  leave: jest.Mock<Promise<void>, [string]>;
};

function sock(opts: { dataUserId?: string; legacyUserId?: string }): FakeSocket {
  const s: FakeSocket = { leave: jest.fn<Promise<void>, [string]>(async () => undefined) };
  if (opts.dataUserId !== undefined) s.data = { userId: opts.dataUserId };
  else s.data = {};
  if (opts.legacyUserId !== undefined) s.userId = opts.legacyUserId;
  return s;
}

function makeGateway(fetchSockets: () => Promise<FakeSocket[]>) {
  const gateway = new AppGateway(
    {} as never, // db
    {} as never, // jwt
    {} as never, // config
    {} as never, // conversationsService
    {} as never, // realtime
    {} as never, // activitiesService
    {} as never, // notificationsService
    {} as never, // rateLimit
  );
  const rooms: string[] = [];
  gateway.server = {
    in: (room: string) => {
      rooms.push(room);
      return { fetchSockets };
    },
  } as never;
  const warn = jest.fn();
  (gateway as unknown as { logger: { warn: jest.Mock } }).logger = { warn };
  return { gateway, rooms, warn };
}

describe('AppGateway.evictFromMatch (P1-70)', () => {
  it('evicts only the target socket(s) from match:<id>', async () => {
    const target = sock({ dataUserId: TARGET });
    const target2 = sock({ dataUserId: TARGET }); // second tab/device
    const other = sock({ dataUserId: OTHER });
    const { gateway, rooms } = makeGateway(async () => [target, other, target2]);

    await gateway.evictFromMatch(MATCH_ID, TARGET);

    expect(rooms).toEqual([ROOM]);
    expect(target.leave).toHaveBeenCalledWith(ROOM);
    expect(target2.leave).toHaveBeenCalledWith(ROOM);
    expect(other.leave).not.toHaveBeenCalled();
  });

  it('matches legacy sockets exposing userId directly on the socket object', async () => {
    const legacy = sock({ legacyUserId: TARGET });
    const { gateway } = makeGateway(async () => [legacy]);

    await gateway.evictFromMatch(MATCH_ID, TARGET);

    expect(legacy.leave).toHaveBeenCalledTimes(1);
    expect(legacy.leave).toHaveBeenCalledWith(ROOM);
  });

  it('leaves non-matching sockets untouched (incl. sockets with no user id)', async () => {
    const a = sock({ dataUserId: OTHER });
    const b = sock({ legacyUserId: OTHER });
    const anon = sock({});
    const { gateway, warn } = makeGateway(async () => [a, b, anon]);

    await gateway.evictFromMatch(MATCH_ID, TARGET);

    expect(a.leave).not.toHaveBeenCalled();
    expect(b.leave).not.toHaveBeenCalled();
    expect(anon.leave).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('swallows a rejecting fetchSockets with a warn (never throws)', async () => {
    const { gateway, warn } = makeGateway(async () => {
      throw new Error('adapter down');
    });

    await expect(gateway.evictFromMatch(MATCH_ID, TARGET)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('adapter down');
  });
});
