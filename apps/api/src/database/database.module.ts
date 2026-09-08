import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as pg from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const postgres = (pg as any).default ?? pg;

/**
 * Pool sizing/timeouts, env-tunable (run #43, DB/Infra rotation).
 * Rationale: the postgres-js default pool (max 10) has NO idle/connect
 * timeouts — a DB stall (Neon cold start, network drop: Sentry API-16/17)
 * wedges requests indefinitely. Defaults here keep prior behavior's
 * capacity while adding fail-fast; ops can raise `max` via env without a
 * code change.
 */
export function buildPoolOptions(env: Record<string, string | undefined> = {}): {
  ssl: 'require' | false;
  max: number;
  idle_timeout: number;
  connect_timeout: number;
} {
  const int = (raw: string | undefined, fallback: number): number => {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    ssl: env.SSL_MODE === 'require' ? ('require' as const) : false,
    max: int(env.DATABASE_POOL_MAX, 10),
    idle_timeout: int(env.DATABASE_IDLE_TIMEOUT, 30),
    connect_timeout: int(env.DATABASE_CONNECT_TIMEOUT, 10),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: 'DB_CONNECTION',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const opts = buildPoolOptions({
          SSL_MODE: config.get<string>('SSL_MODE'),
          DATABASE_POOL_MAX: config.get<string>('DATABASE_POOL_MAX'),
          DATABASE_IDLE_TIMEOUT: config.get<string>('DATABASE_IDLE_TIMEOUT'),
          DATABASE_CONNECT_TIMEOUT: config.get<string>('DATABASE_CONNECT_TIMEOUT'),
        });
        const client = postgres(
          config.getOrThrow<string>('DATABASE_URL'),
          opts,
        );
        return drizzle(client, { schema });
      },
    },
  ],
  exports: ['DB_CONNECTION'],
})
export class DatabaseModule {}
