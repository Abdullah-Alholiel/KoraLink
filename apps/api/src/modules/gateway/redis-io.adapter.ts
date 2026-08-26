import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Env-gated Socket.IO Redis adapter.
 *
 * When `WS_REDIS_ADAPTER=true`, a Redis Pub/Sub adapter is attached so rooms and
 * broadcasts span every API instance (chat, roster, POTM, ops pings reach clients
 * on any node). When unset, the default in-memory adapter is used and dev is
 * byte-for-byte unchanged.
 *
 * Two ioredis clients are required: one for publishing, one for subscribing
 * (`subClient = pubClient.duplicate()`). Error handlers log — never swallow —
 * because a dead Redis silently drops cross-instance events otherwise.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connectToRedis(host: string, port: number, password?: string): Promise<void> {
    const pubClient = new Redis({
      host,
      port,
      password: password || undefined,
      // Pub/Sub clients are long-lived; disable per-command retry limits so a
      // transient Redis blip doesn't throw on every subsequent command.
      maxRetriesPerRequest: null,
    });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (e) => this.logger.error(`[redis-adapter] pub: ${e.message}`));
    subClient.on('error', (e) => this.logger.error(`[redis-adapter] sub: ${e.message}`));
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
