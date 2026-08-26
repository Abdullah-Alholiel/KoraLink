import { describe, it, expect, vi, beforeEach } from 'vitest';

// Default mock — individual tests override via vi.doMock + dynamic import.
vi.mock('@/env.mjs', () => ({
  env: {
    NEXT_PUBLIC_API_URL: 'http://100.93.99.24:3001/api/v1',
  },
}));
const ioMock = vi.fn();
vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => ioMock(...args),
}));

import { socketBaseUrl, createLobbySocket, LOBBY_NAMESPACE } from '@/lib/socket';

describe('socketBaseUrl', () => {
  it('strips the /api/v1 path from an http base (the production namespace bug)', () => {
    expect(socketBaseUrl()).toBe('http://100.93.99.24:3001');
  });
});

describe('socketBaseUrl (env variants)', () => {
  async function withEnv(value: string | undefined): Promise<string> {
    vi.resetModules();
    vi.doMock('@/env.mjs', () => ({
      env: { NEXT_PUBLIC_API_URL: value },
    }));
    const mod = await import('@/lib/socket');
    return mod.socketBaseUrl();
  }

  it('handles https with a custom port (tailscale serve cutover)', async () => {
    expect(await withEnv('https://aa.tail2948f9.ts.net:8443/api/v1')).toBe(
      'https://aa.tail2948f9.ts.net:8443',
    );
  });

  it('handles a trailing slash', async () => {
    expect(await withEnv('https://aa.tail2948f9.ts.net:8443/api/v1/')).toBe(
      'https://aa.tail2948f9.ts.net:8443',
    );
  });

  it('falls back to localhost when unset', async () => {
    expect(await withEnv(undefined)).toBe('http://localhost:3001');
  });

  it('falls back to localhost on garbage input', async () => {
    expect(await withEnv('not a url')).toBe('http://localhost:3001');
  });
});

describe('createLobbySocket', () => {
  beforeEach(() => {
    ioMock.mockReset();
    window.localStorage.setItem('koralink_token', 'tok-123');
  });

  it('connects to the /lobby namespace on the ORIGIN (not the pathful base)', () => {
    createLobbySocket();
    const [url, opts] = ioMock.mock.calls[0];
    expect(url).toBe('http://100.93.99.24:3001/lobby');
    expect(url).not.toContain('/api/v1');
    expect(opts).toMatchObject({
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      auth: { token: 'tok-123' },
    });
  });

  it('honors a custom reconnectionAttempts (NotificationProvider uses 10)', () => {
    createLobbySocket(10);
    expect(ioMock.mock.calls[0][1].reconnectionAttempts).toBe(10);
  });

  it('omits auth when no token is stored', () => {
    window.localStorage.removeItem('koralink_token');
    createLobbySocket();
    expect(ioMock.mock.calls[0][1].auth).toBeUndefined();
  });

  it('namespace constant matches the gateway registration', () => {
    expect(LOBBY_NAMESPACE).toBe('/lobby');
  });
});
