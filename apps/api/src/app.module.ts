import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { MatchesModule } from './modules/matches/matches.module';
import { UsersModule } from './modules/users/users.module';
import { VenuesModule } from './modules/venues/venues.module';
import { PitchesModule } from './modules/pitches/pitches.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { HealthModule } from './modules/health/health.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { FollowsModule } from './modules/follows/follows.module';
import { ConversationsModule } from './modules/conversations/conversations.module';

@Module({
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  imports: [
    // ── Config ──────────────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),

    // ── Structured logging (Pino / OCI-ready JSON) ──────────────────────
    LoggerModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('NODE_ENV') === 'production' ? 'info' : 'debug',
          genReqId: (req, res) => {
            const id = randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport:
            config.get('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
        },
      }),
      inject: [ConfigService],
    }),

    // ── Rate limiting ────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60_000, limit: 60 }],
      }),
    }),

    // ── Redis cache ──────────────────────────────────────────────────────
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: (config: ConfigService) => ({
        store: 'redis',
        host: config.get('REDIS_HOST', 'localhost'),
        port: config.get<number>('REDIS_PORT', 6379),
        password: config.get('REDIS_PASSWORD', ''),
        ttl: 60,
      }),
      inject: [ConfigService],
    }),

    // ── Feature modules ──────────────────────────────────────────────────
    DatabaseModule,
    AuthModule,
    MatchesModule,
    UsersModule,
    VenuesModule,
    PitchesModule,
    WalletModule,
    NotificationsModule,
    GatewayModule,
    HealthModule,
    ActivitiesModule,
    FollowsModule,
    ConversationsModule,
  ],
})
export class AppModule {}
