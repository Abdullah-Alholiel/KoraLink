import { AppGateway } from './app.gateway';

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
