import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as Sentry from '@sentry/node';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RedisIoAdapter } from './modules/gateway/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ── Structured JSON logger (OCI-ready) ──────────────────────────────────
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const playerUrls = configService
    .get<string>('PLAYER_URL', 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const adminUrls = configService
    .get<string>('ADMIN_URL', 'http://localhost:3002')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const port = configService.get<number>('PORT', 3001);
  const cookieSecret = configService.get<string>('COOKIE_SECRET', 'change-me');

  // ── Sentry error tracking (env-gated — no-op without SENTRY_DSN) ────────
  const sentryDsn = configService.get<string>('SENTRY_DSN', '');
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: configService.get('NODE_ENV', 'development'),
      tracesSampleRate: 0.1,
      beforeSend(event) {
        // Strip PII before it leaves the box. `sendDefaultPii` is false, but
        // headers (Authorization) and body data (phone) can still leak.
        const req = event.request;
        if (req) {
          if (req.headers) {
            delete req.headers['authorization'];
            delete req.headers['cookie'];
          }
          if (req.data && typeof req.data === 'object') {
            delete (req.data as Record<string, unknown>)['phone'];
          }
        }
        return event;
      },
    });
  }

  // ── Global exception filter (Sentry + Pino correlation, Nest error shape) ──
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  // ── Security middleware ──────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser(cookieSecret));

  // ── Response compression (gzip) — cuts JSON payload ~80% ────────────────
  // App-level because KoraLink is served directly by Node (systemd), not behind
  // a reverse proxy. The `compression` middleware skips SSE/WebSocket and
  // already-encoded responses, so realtime + static flows are unaffected.
  app.use(compression());

  // ── CORS — HttpOnly cookies require credentials: true ───────────────────
  // Strict allowlist from PLAYER_URL/ADMIN_URL (comma-separated origins are
  // supported). Non-browser requests (no Origin header — curl, health checks,
  // native apps) pass through; every browser origin must be explicitly listed.
  // Never widen this with a NODE_ENV check — an attacker on the same Tailscale
  // network with a misconfigured .env (NODE_ENV unset) would then be able to
  // make credentialed cross-origin requests from any origin.
  const allowedOrigins = [...playerUrls, ...adminUrls];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  });

  // ── Global validation pipe ───────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── API prefix ───────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Swagger (Cookie-Auth configured) ────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('KoraLink API')
    .setDescription(
      'Hyper-local sports matchmaking platform — Saudi Arabia.\n\n' +
        'Authentication uses **HttpOnly cookies** (no JWT in response body). ' +
        'Call `POST /api/v1/auth/verify-otp` to receive the `access_token` cookie.',
    )
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { withCredentials: true },
  });

  // ── Socket.IO Redis adapter (env-gated — in-memory unless WS_REDIS_ADAPTER=true) ──
  // Reuses the same Redis as CacheModule/Bull (REDIS_HOST/PORT/PASSWORD). Opt-in so
  // dev stays on the in-memory adapter with zero config.
  if (configService.get<string>('WS_REDIS_ADAPTER', 'false') === 'true') {
    const ioAdapter = new RedisIoAdapter(app);
    await ioAdapter.connectToRedis(
      configService.get<string>('REDIS_HOST', 'localhost'),
      configService.get<number>('REDIS_PORT', 6379),
      configService.get<string>('REDIS_PASSWORD', ''),
    );
    app.useWebSocketAdapter(ioAdapter);
  }

  // ── Graceful shutdown — drains HTTP + Socket.IO on SIGTERM (systemd restart) ──
  app.enableShutdownHooks();

  await app.listen(port);
}

bootstrap();
