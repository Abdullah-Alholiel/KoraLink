# Realtime Scaling — Gates 1–3 (Product · Architecture · Program Design)

## Gate 1 — Product

- **US1** — As an operator running N API instances, rooms/presence and `io.to(room).emit()`
  work across instances (chat, roster, POTM, ops pings reach clients on every instance).
- **US2** — As an operator, `systemctl --user restart koralink-api.service` drains active
  sockets cleanly (no "socket hang up" storm in logs).
- **US3** — As a developer, `npm run dev` boots with zero config and behaves exactly as
  today (in-memory adapter).

**Out of scope now:** sticky-session LB config (documented in the `koralink-realtime-scaling`
skill, not implemented), cross-instance `isUserOnline` (single-instance today), Socket.IO
Redis Streams adapter.

## Gate 2 — Architecture

- **Env-gated adapter.** Custom `RedisIoAdapter extends IoAdapter`, opt-in via
  `WS_REDIS_ADAPTER=true`. Reuses the existing `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`
  (same Redis as cache-manager + Bull). Unset/`false` ⇒ in-memory (dev unchanged).
- **Pub/Sub clients.** Two `ioredis` clients (`pubClient` + `subClient = pubClient.duplicate()`)
  → `createAdapter(pub, sub)`. Error handlers log, never swallow (a dead Redis must not
  silently drop cross-instance events).
- **Graceful shutdown.** `app.enableShutdownHooks()` in `main.ts` + `AppGateway.beforeApplicationShutdown()`
  closing the underlying io Server (via the namespace's `.server`), so sockets drain before exit.
- **Presence caveat (documented, not fixed).** `isUserOnline()` stays per-instance — correct
  for the single-instance deploy; when scaling to 2+ instances, switch to
  `server.in(room).fetchSockets()` (cluster-aware).

## Gate 3 — Program Design

### 1. Dependency (`apps/api`)

```bash
npm install @socket.io/redis-adapter
```

### 2. New file — `apps/api/src/modules/gateway/redis-io.adapter.ts`

```typescript
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Env-gated Socket.IO Redis adapter. WS_REDIS_ADAPTER=true attaches a Redis
 * Pub/Sub adapter so rooms/broadcasts span API instances; otherwise the default
 * in-memory adapter is used and dev is unchanged.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connectToRedis(host: string, port: number, password?: string): Promise<void> {
    const pubClient = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null, // pub/sub is long-lived; don't fail on per-command retries
    });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (e) => this.logger.error(`[redis-adapter] pub: ${e.message}`));
    subClient.on('error', (e) => this.logger.error(`[redis-adapter] sub: ${e.message}`));
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
```

### 3. `apps/api/src/main.ts`

- After `app.enableCors(...)`, before `app.listen(port)`:

```typescript
// ── Socket.IO Redis adapter (env-gated — in-memory unless WS_REDIS_ADAPTER=true) ──
if (configService.get<string>('WS_REDIS_ADAPTER', 'false') === 'true') {
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connectToRedis(
    configService.get<string>('REDIS_HOST', 'localhost'),
    configService.get<number>('REDIS_PORT', 6379),
    configService.get<string>('REDIS_PASSWORD', ''),
  );
  app.useWebSocketAdapter(ioAdapter);
}

// ── Graceful shutdown (drains HTTP + Socket.IO on SIGTERM) ──
app.enableShutdownHooks();
```

### 4. `apps/api/src/modules/gateway/app.gateway.ts`

Add a shutdown hook (import `BeforeApplicationShutdown` or just the method):

```typescript
beforeApplicationShutdown(signal?: string): void {
  // this.server is the /lobby Namespace; its `.server` is the parent io Server.
  const io = (this.server as unknown as import('socket.io').Namespace).server;
  io.close();
  this.logger.log(`Socket.IO server closed (${signal ?? 'shutdown'})`);
}
```

### 5. Docs

- `apps/api/.env.example` → add `WS_REDIS_ADAPTER=false` under the `REDIS_*` lines.
- `apps/api/docs/TECHNICAL.md` env table → add `WS_REDIS_ADAPTER` (optional, default `false`).

### 6. Test

- New unit test `redis-io.adapter.spec.ts`: adapter leaves the server in-memory when not
  connected (no `adapterConstructor`), and `connectToRedis` builds an adapter when called
  (assert `adapterConstructor` is set). No live Redis in the unit test.
- Existing `realtime.service.spec.ts` must stay green.

## Gate 4 — Verification checklist

- [ ] `cd apps/api && npx tsc --noEmit` green
- [ ] `cd apps/api && npm test` (jest) green
- [ ] `turbo run build` green (all apps)
- [ ] Dev boots with no `WS_REDIS_ADAPTER` → in-memory, rooms work (zero config)
- [ ] With `WS_REDIS_ADAPTER=true` + Redis up → adapter attached, `redis-cli MONITOR` shows Pub/Sub
- [ ] SIGTERM drains cleanly (no socket-hang-up spam)
