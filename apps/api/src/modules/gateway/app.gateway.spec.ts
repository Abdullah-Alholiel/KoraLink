import { AppGateway } from './app.gateway';
import { users } from '../../database/schema';

/**
 * Unit tests for `handleConnection` moderation enforcement (run #6).
 *
 * The gateway must mirror `jwt-cookie.strategy.validate()`: re-read the user row
 * on every socket handshake so ban/suspend and role changes apply IMMEDIATELY,
 * not at JWT expiry (up to 7 days stale).
 */

type UserRow = {
  id: string;
  role: 'Player' | 'VenueOwner' | 'Admin';
  banned_at: Date | null;
  suspended_until: Date | null;
  /** P1-36 (run #31): PDPL soft-delete timestamp — set ⇒ handshake rejected. */
  deleted_at?: Date | null;
};

function makeDb(rows: UserRow[]) {
  // Drizzle chain: .select({...}).from(users).where(eq(...)).limit(1) -> row[]
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

function makeGateway(dbRows: UserRow[], payload: { sub: string; role?: string }) {
  const gateway = new AppGateway(
    makeDb(dbRows) as never,
    { verify: () => payload } as never,
    {
      get: (_key: string, def?: string) => {
        if (_key === 'PLAYER_URL') return 'http://localhost:3000';
        if (_key === 'ADMIN_URL') return 'http://localhost:3002';
        if (_key === 'NODE_ENV') return 'development';
        if (_key === 'JWT_SECRET') return 'test-secret';
        return def;
      },
      // Run #22: the gateway verifies tokens with getOrThrow (no silent
      // fallback secret) — the stub must expose the same contract.
      getOrThrow: (_key: string) => {
        if (_key === 'JWT_SECRET') return 'test-secret';
        if (_key === 'PLAYER_URL') return 'http://localhost:3000';
        if (_key === 'ADMIN_URL') return 'http://localhost:3002';
        if (_key === 'NODE_ENV') return 'development';
        throw new Error(`config key not stubbed: ${_key}`);
      },
    } as never,
    {} as never,
    { userRoom: (id: string) => `user:${id}`, registerServer: () => undefined } as never,
    {} as never,
    {} as never,
    // Run #36 (P1-42): per-socket WS rate limiter — always-allow stub for the
    // connection-moderation suites; flood behavior has its own spec file.
    { consume: () => ({ allowed: true, retryAfterSec: 0 }) } as never,
  );
  return gateway;
}

function makeClient() {
  const client: {
    handshake: { headers: { origin?: string; cookie?: string }; auth: { token?: string } };
    userId?: string;
    role?: string;
    joined: string[];
    join: (room: string) => Promise<void>;
    disconnect: (close?: boolean) => void;
  } = {
    handshake: { headers: { origin: 'http://localhost:3000', cookie: 'access_token=test-token' }, auth: { token: 'test-token' } },
    joined: [],
    join: async (room: string) => {
      client.joined.push(room);
    },
    disconnect: () => undefined,
  };
  return client;
}

describe('AppGateway.handleConnection — moderation enforcement', () => {
  it('connects a clean Player and joins only their personal room (no ops)', async () => {
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Player', banned_at: null, suspended_until: null }],
      { sub: 'u1', role: 'Player' },
    );
    const client = makeClient();

    await gateway.handleConnection(client as never);

    expect(client.userId).toBe('u1');
    expect(client.role).toBe('Player');
    expect(client.joined).toEqual(['user:u1']);
  });

  it('joins the ops room when the DB role is Admin', async () => {
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Admin', banned_at: null, suspended_until: null }],
      { sub: 'u1', role: 'Admin' },
    );
    const client = makeClient();

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual(['user:u1', 'ops']);
  });

  it('does NOT join ops when the token role is Admin but the DB role was demoted to Player', async () => {
    // Stale token says Admin; DB says Player (demoted). DB role must win.
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Player', banned_at: null, suspended_until: null }],
      { sub: 'u1', role: 'Admin' },
    );
    const client = makeClient();

    await gateway.handleConnection(client as never);

    expect(client.role).toBe('Player');
    expect(client.joined).toEqual(['user:u1']); // no 'ops'
  });

  it('rejects a banned user before joining any room', async () => {
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Player', banned_at: new Date(), suspended_until: null }],
      { sub: 'u1', role: 'Player' },
    );
    const client = makeClient();
    const disconnect = jest.spyOn(client, 'disconnect');

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual([]);
    expect(client.userId).toBeUndefined();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects a user suspended until a future time', async () => {
    const gateway = makeGateway(
      [
        {
          id: 'u1',
          role: 'Player',
          banned_at: null,
          suspended_until: new Date(Date.now() + 60_000),
        },
      ],
      { sub: 'u1', role: 'Player' },
    );
    const client = makeClient();
    const disconnect = jest.spyOn(client, 'disconnect');

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual([]);
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('allows a user whose suspension has already expired', async () => {
    const gateway = makeGateway(
      [
        {
          id: 'u1',
          role: 'Player',
          banned_at: null,
          suspended_until: new Date(Date.now() - 60_000),
        },
      ],
      { sub: 'u1', role: 'Player' },
    );
    const client = makeClient();

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual(['user:u1']);
  });

  it('rejects a token whose user no longer exists (stale sub)', async () => {
    const gateway = makeGateway([], { sub: 'ghost', role: 'Player' });
    const client = makeClient();
    const disconnect = jest.spyOn(client, 'disconnect');

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual([]);
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  // P1-36 (run #31): PDPL parity with the REST strategy — a soft-deleted
  // user's regular JWT must not keep realtime access after deletion.
  it('rejects a soft-deleted user at handshake (PDPL deleted_at)', async () => {
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Player', banned_at: null, suspended_until: null, deleted_at: new Date() }],
      { sub: 'u1', role: 'Player' },
    );
    const client = makeClient();
    const disconnect = jest.spyOn(client, 'disconnect');

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual([]);
    expect(client.userId).toBeUndefined();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  // P1-17c (run #27): the WS handshake must enforce the origin allowlist in
  // every environment — Strix flagged the previous NODE_ENV-gated bypass
  // (run #25). The check runs BEFORE the JWT verify so a probing connection
  // is closed without a DB round-trip.
  it('rejects a connection from an unlisted origin in development', async () => {
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Player', banned_at: null, suspended_until: null }],
      { sub: 'u1', role: 'Player' },
    );
    const client = makeClient();
    client.handshake.headers.origin = 'https://attacker.example';
    const disconnect = jest.spyOn(client, 'disconnect');

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual([]);
    expect(client.userId).toBeUndefined();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects a connection from an unlisted origin when NODE_ENV=production', async () => {
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Player', banned_at: null, suspended_until: null }],
      { sub: 'u1', role: 'Player' },
    );
    // Override the stub to simulate prod
    (gateway as unknown as { config: { get: (k: string) => string } }).config = {
      get: (k: string) => (k === 'NODE_ENV' ? 'production' : 'http://localhost:3000'),
    } as never;
    const client = makeClient();
    client.handshake.headers.origin = 'https://attacker.example';
    const disconnect = jest.spyOn(client, 'disconnect');

    await gateway.handleConnection(client as never);

    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('accepts a connection from a listed PLAYER_URL origin', async () => {
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Player', banned_at: null, suspended_until: null }],
      { sub: 'u1', role: 'Player' },
    );
    const client = makeClient();
    client.handshake.headers.origin = 'http://localhost:3000';

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual(['user:u1']);
    expect(client.userId).toBe('u1');
  });

  it('accepts a connection from a listed ADMIN_URL origin', async () => {
    const gateway = makeGateway(
      [{ id: 'u1', role: 'Admin', banned_at: null, suspended_until: null }],
      { sub: 'u1', role: 'Admin' },
    );
    const client = makeClient();
    client.handshake.headers.origin = 'http://localhost:3002';

    await gateway.handleConnection(client as never);

    expect(client.joined).toEqual(['user:u1', 'ops']);
  });
});

// ── P1-48 (run #57): mid-session moderation gate ────────────────────────────
// A socket outlives the moderation action that bans its user (JWT lives 7
// days). Every state-changing handler must therefore re-read the account
// state BEFORE rate-limit consumption, membership reads, writes, or
// broadcasts — the WS counterpart of jwt-cookie.strategy.validate().

describe('AppGateway per-message moderation gate (P1-48, run #57)', () => {
  type Row = {
    id: string;
    role?: string;
    banned_at: Date | null;
    suspended_until: Date | null;
    deleted_at?: Date | null;
  };

  const active: Row = { id: 'u1', role: 'Player', banned_at: null, suspended_until: null };

  /** DB stub routed by table: `users` selects return userRow (null = missing row),
   * `match_players` selects return the membership row; insert → returning. */
  function makeRoutedDb(userRow: Row | null, membership: Array<{ id: string }> = [{ id: 'mp-1' }]) {
    return {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => (table === users ? (userRow ? [userRow] : []) : membership),
          }),
        }),
      }),
      query: { match_messages: { findFirst: async () => undefined } },
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ id: 'msg-1', match_id: 'm1', user_id: 'u1', content: 'hi' }],
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: async () => [{ id: 'mp-1' }] }),
        }),
      }),
    };
  }

  function makeGw(db: unknown, consume = jest.fn(() => ({ allowed: true, retryAfterSec: 0 }))) {
    const gateway = new AppGateway(
      db as never,
      { verify: () => ({ sub: 'u1', role: 'Player' }) } as never,
      {
        get: (_k: string, def?: string) => def,
        getOrThrow: (k: string) => {
          if (k === 'JWT_SECRET') return 'test-secret';
          throw new Error(`config key not stubbed: ${k}`);
        },
      } as never,
      { isParticipant: jest.fn(async () => true) } as never,
      { userRoom: (id: string) => `user:${id}`, registerServer: () => undefined } as never,
      {} as never,
      {} as never,
      { consume, release: () => undefined } as never,
    );
    gateway.server = { to: () => ({ emit: () => undefined }) } as never;
    return { gateway, consume: consume as jest.Mock, isParticipant: gateway['conversationsService']['isParticipant'] as jest.Mock };
  }

  function makeClient() {
    return {
      userId: 'u1',
      to: () => ({ emit: () => undefined }),
      join: async () => undefined,
      leave: async () => undefined,
    };
  }

  const BANNED: Row = { ...active, banned_at: new Date() };
  const SUSPENDED: Row = { ...active, suspended_until: new Date(Date.now() + 86_400_000) };
  const DELETED: Row = { ...active, deleted_at: new Date() };
  const MSG = 'Your account can no longer perform this action.';

  it('send-message: banned mid-session → rejected before consuming the rate-limit bucket', async () => {
    const { gateway, consume } = makeGw(makeRoutedDb(BANNED));
    const client = makeClient();

    await expect(
      gateway.handleMessage({ matchId: 'm1', content: 'still here' }, client as never),
    ).rejects.toThrow(MSG);
    expect(consume).not.toHaveBeenCalled();
  });

  it('send-message: suspended (future until) → rejected', async () => {
    const { gateway } = makeGw(makeRoutedDb(SUSPENDED));

    await expect(
      gateway.handleMessage({ matchId: 'm1', content: 'hi' }, makeClient() as never),
    ).rejects.toThrow(MSG);
  });

  it('send-message: soft-deleted → rejected', async () => {
    const { gateway } = makeGw(makeRoutedDb(DELETED));

    await expect(
      gateway.handleMessage({ matchId: 'm1', content: 'hi' }, makeClient() as never),
    ).rejects.toThrow(MSG);
  });

  it('send-message: account row removed entirely → rejected (fail closed)', async () => {
    const { gateway } = makeGw(makeRoutedDb(null));

    await expect(
      gateway.handleMessage({ matchId: 'm1', content: 'hi' }, makeClient() as never),
    ).rejects.toThrow(MSG);
  });

  it('send-message: clean account → full happy chain still works', async () => {
    const { gateway } = makeGw(makeRoutedDb(active));

    await expect(
      gateway.handleMessage({ matchId: 'm1', content: 'glhf' }, makeClient() as never),
    ).resolves.toBeUndefined();
  });

  it('send-dm: banned mid-session → rejected', async () => {
    const { gateway } = makeGw(makeRoutedDb(BANNED));

    await expect(
      gateway.handleDm({ conversationId: 'c1', content: 'hi' }, makeClient() as never),
    ).rejects.toThrow(MSG);
  });

  it('join-lobby: banned mid-session → rejected before the membership read', async () => {
    const { gateway } = makeGw(makeRoutedDb(BANNED));

    await expect(
      gateway.handleJoinLobby({ matchId: 'm1' }, makeClient() as never),
    ).rejects.toThrow(MSG);
  });

  it('join-conversation: banned mid-session → rejected before the participant check', async () => {
    const { gateway, isParticipant } = makeGw(makeRoutedDb(BANNED));

    await expect(
      gateway.handleJoinConversation({ conversationId: 'c1' }, makeClient() as never),
    ).rejects.toThrow(MSG);
    expect(isParticipant).not.toHaveBeenCalled();
  });

  it('mark-read: banned mid-session → rejected', async () => {
    const { gateway } = makeGw(makeRoutedDb(BANNED));

    await expect(
      gateway.handleMarkRead({ conversationId: 'c1' }, makeClient() as never),
    ).rejects.toThrow(MSG);
  });

  it('mark-chat-read: banned mid-session → rejected', async () => {
    const { gateway } = makeGw(makeRoutedDb(BANNED));

    await expect(
      gateway.handleMarkChatRead({ matchId: 'm1' }, makeClient() as never),
    ).rejects.toThrow(MSG);
  });

  it('leave-conversation: NOT gated — a banned user may still leave (P2-6 exemption)', async () => {
    const { gateway } = makeGw(makeRoutedDb(BANNED));
    const client = makeClient();

    await expect(
      gateway.handleLeaveConversation({ conversationId: 'c1' }, client as never),
    ).resolves.toBeUndefined();
  });
});

