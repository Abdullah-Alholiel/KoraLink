import { WsException } from '@nestjs/websockets';
import { AppGateway } from './app.gateway';
import { users } from '../../database/schema';

/** Room ids must be UUID-shaped (run #78 gateway id-shape check). */
const MATCH_ID = '11111111-1111-4111-8111-111111111111';

/**
 * P2-58 (run #50): the `mark-chat-read` WS handler must advance the caller's
 * roster-row read watermark, refuse unauthenticated sockets, and refuse
 * non-members (zero updated rows → WsException, mirroring join-lobby).
 * Read state is PRIVATE — the room must never be broadcast to.
 *
 * Run #57 (P1-48): every state-changing handler now passes through the
 * mid-session moderation gate first (requireActiveUser — a users-table
 * SELECT). The DB stub routes by table: `users` selects return the given
 * account row (default: clean), everything else falls through to the
 * match_players update chain under test.
 */

type UserRow = {
  id: string;
  banned_at: Date | null;
  suspended_until: Date | null;
  deleted_at?: Date | null;
};

function makeDb(returningRows: Array<{ id: string }>, userRow: UserRow | null = cleanUser()) {
  const setArgCapture: { value: unknown } = { value: undefined };
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => (table === users ? (userRow ? [userRow] : []) : []),
          }),
        }),
      }),
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

function cleanUser(): UserRow {
  return { id: 'u1', banned_at: null, suspended_until: null };
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
      gateway.handleMarkChatRead({ matchId: MATCH_ID }, client as never),
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
      gateway.handleMarkChatRead({ matchId: MATCH_ID }, client as never),
    ).rejects.toThrow(WsException);
  });

  it('rejects non-members (zero updated rows)', async () => {
    const { db } = makeDb([]);
    const gateway = makeGateway(db);
    const client = makeClient('u1');

    await expect(
      gateway.handleMarkChatRead({ matchId: MATCH_ID }, client as never),
    ).rejects.toThrow('You are not a member of this match.');
  });

  // P1-48 (run #57): the moderation gate runs BEFORE the watermark write.
  it('rejects a user banned mid-session before touching the roster row', async () => {
    const { db, setArgCapture } = makeDb([{ id: 'mp-1' }], {
      id: 'u1',
      banned_at: new Date(),
      suspended_until: null,
    });
    const gateway = makeGateway(db);
    const client = makeClient('u1');

    await expect(
      gateway.handleMarkChatRead({ matchId: MATCH_ID }, client as never),
    ).rejects.toThrow('Your account can no longer perform this action.');
    expect(setArgCapture.value).toBeUndefined(); // no write attempted
  });
});
