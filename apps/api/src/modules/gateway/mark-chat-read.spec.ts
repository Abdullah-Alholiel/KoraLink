import { WsException } from '@nestjs/websockets';
import { AppGateway } from './app.gateway';

/**
 * P2-58 (run #50): the `mark-chat-read` WS handler must advance the caller's
 * roster-row read watermark, refuse unauthenticated sockets, and refuse
 * non-members (zero updated rows → WsException, mirroring join-lobby).
 * Read state is PRIVATE — the room must never be broadcast to.
 */

function makeDb(returningRows: Array<{ id: string }>) {
  const setArgCapture: { value: unknown } = { value: undefined };
  return {
    db: {
      update: () => ({
        set: (arg: unknown) => {
          setArgCapture.value = arg;
          return {
            where: () => ({
              returning: async () => returningRows,
            }),
          };
        },
      }),
    },
    setArgCapture,
  };
}

function makeGateway(db: ReturnType<typeof makeDb>['db']) {
  return new AppGateway(
    db as never,
    { verify: () => ({ sub: 'u1', role: 'Player' }) } as never,
    {
      get: (_k: string, def?: string) => def,
      getOrThrow: (k: string) => {
        if (k === 'JWT_SECRET') return 'test-secret';
        throw new Error(`config key not stubbed: ${k}`);
      },
    } as never,
    {} as never, // conversationsService
    { userRoom: (id: string) => `user:${id}`, registerServer: () => undefined } as never,
    {} as never,
    {} as never,
    { consume: () => ({ allowed: true, retryAfterSec: 0 }) } as never,
  );
}

function makeClient(userId?: string) {
  return {
    userId,
    broadcast: [],
    to: () => ({ emit: () => undefined }),
  };
}

describe('AppGateway mark-chat-read (P2-58)', () => {
  it('advances the watermark for a member (update hits their roster row)', async () => {
    const { db, setArgCapture } = makeDb([{ id: 'mp-1' }]);
    const gateway = makeGateway(db);
    const client = makeClient('u1');

    await expect(
      gateway.handleMarkChatRead({ matchId: 'm1' }, client as never),
    ).resolves.toBeUndefined();

    // The set payload must carry last_read_at and NOTHING else — in
    // particular never `updated_at` (match_players has no such column;
    // withTimestamp here would 500 live with 42703).
    const setArg = setArgCapture.value as Record<string, unknown>;
    expect(Object.keys(setArg)).toEqual(['last_read_at']);
    expect(setArg.last_read_at).toBeInstanceOf(Date);
  });

  it('rejects unauthenticated sockets', async () => {
    const { db } = makeDb([]);
    const gateway = makeGateway(db);
    const client = makeClient(undefined);

    await expect(
      gateway.handleMarkChatRead({ matchId: 'm1' }, client as never),
    ).rejects.toThrow(WsException);
  });

  it('rejects non-members (zero updated rows) — join-lobby parity', async () => {
    const { db } = makeDb([]);
    const gateway = makeGateway(db);
    const client = makeClient('u1');

    await expect(
      gateway.handleMarkChatRead({ matchId: 'm1' }, client as never),
    ).rejects.toThrow('You are not a member of this match.');
  });
});
