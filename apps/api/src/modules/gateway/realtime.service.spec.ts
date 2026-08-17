import { RealtimeService } from './realtime.service';

describe('RealtimeService.isUserOnline', () => {
  it('returns false when no server is registered', () => {
    const svc = new RealtimeService();
    expect(svc.isUserOnline('u1')).toBe(false);
  });

  it('detects an online user via Namespace.adapter.rooms (namespaced gateway)', () => {
    const svc = new RealtimeService();
    const rooms = new Map<string, Set<string>>([['user:u1', new Set(['sock1'])]]);
    svc.registerServer({
      adapter: { rooms },
      to: () => ({ emit: () => undefined }),
    } as never);

    expect(svc.isUserOnline('u1')).toBe(true);
    expect(svc.isUserOnline('u2')).toBe(false);
  });

  it('does not throw when .sockets is a Map (Namespace shape) — regression for "Cannot read properties of undefined (reading \'rooms\')"', () => {
    const svc = new RealtimeService();
    // A socket.io Namespace exposes `.sockets` as a Map (NOT a nested server),
    // so `.sockets.adapter` is undefined. The old code read
    // `this.server.sockets.adapter.rooms` and threw on exactly this shape.
    svc.registerServer({
      adapter: { rooms: new Map<string, Set<string>>() },
      sockets: new Map(),
      to: () => ({ emit: () => undefined }),
    } as never);

    expect(() => svc.isUserOnline('u1')).not.toThrow();
    expect(svc.isUserOnline('u1')).toBe(false);
  });

  it('detects an online user via Server.sockets.adapter.rooms (bare io server)', () => {
    const svc = new RealtimeService();
    const rooms = new Map<string, Set<string>>([['user:u1', new Set(['sock1'])]]);
    svc.registerServer({
      adapter: undefined,
      sockets: { adapter: { rooms } },
      to: () => ({ emit: () => undefined }),
    } as never);

    expect(svc.isUserOnline('u1')).toBe(true);
  });
});
