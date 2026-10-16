import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as Sentry from '@sentry/node';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { assertBootstrapSecrets } from './common/security/bootstrap-secrets';
import { resolveTrustProxyConfig } from './common/security/trust-proxy';
import {
  corsDenyMessage,
  isSentryDroppedCorsProbe,
  originAllowed,
} from './common/utils/cors-origin';
import { RedisIoAdapter } from './modules/gateway/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ── Structured JSON logger (OCI-ready) ──────────────────────────────────
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  // ── P0-3: refuse to boot with placeholder/weak auth secrets ─────────────
  // Throws BEFORE app.listen so a misconfigured .env can never serve traffic
  // with a forgeable JWT/cookie secret. See common/security/bootstrap-secrets.ts.
  assertBootstrapSecrets({
    jwtSecret: configService.get<string>('JWT_SECRET'),
    cookieSecret: configService.get<string>('COOKIE_SECRET'),
    nodeEnv: configService.get<string>('NODE_ENV', 'development'),
  });

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

  // ── Trust proxy (audit run-1 api-auth:per-ip-cap-proxy-trust, run #105) ────
  // Without it, req.ip = the ingress proxy's address: the per-IP OTP caps
  // (50/day daily cap + 3/min send-otp throttle) collapse into ONE shared
  // bucket behind the proxy and admin audit logs record the proxy IP. Opt-in
  // via TRUST_PROXY (unset = current behavior; '1' = single ingress hop;
  // 'true' = full XFF chain). Boot-fails on garbage per P0-3 doctrine.
  // See common/security/trust-proxy.ts. INestApplication does not expose
  // Express `set` — go through the underlying adapter instance.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', resolveTrustProxyConfig(configService.get<string>('TRUST_PROXY')));

  // ── Sentry error tracking (env-gated — no-op without SENTRY_DSN) ────────
  const sentryDsn = configService.get<string>('SENTRY_DSN', '');
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: configService.get('NODE_ENV', 'development'),
      tracesSampleRate: 0.1,
      beforeSend(event) {
        // P2-110 (run #137): CORS probe denials are classified at deny time
        // (cors-origin.ts isProbeShapedOrigin → `CORS_PROBE_BLOCKED:` message)
        // and dropped HERE — Sentry's express instrumentation captures the
        // HttpException before the AllExceptionsFilter's >=500 rule, so
        // ignoreErrors is inert for these (proven empirically against
        // @sentry/node 10.70: both Glob and RegExp ignoreErrors forms let the
        // event through; beforeSend → null drops exactly the classified event).
        // Verified live: recording-transport probe = 1 of 2 events sent.
        const excVal = event?.exception?.values?.[0]?.value;
        if (isSentryDroppedCorsProbe(excVal)) {
          return null;
        }
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
  // P2-201 (run #131): origins normalized (trailing-slash env misconfigs no
  // longer 500 every cross-origin call) and denials throw an HttpException
  // with status 403 — a bare Error reached the filter as an unclassified
  // exception and rendered a misleading 500 for what is a policy refusal.
  // The deny MUST stay a thrown error: `callback(null, false)` makes the cors
  // middleware `next()` WITHOUT CORS headers, letting the request execute
  // routes (side effects!) while only the browser hides the response.
  const allowedOrigins = [...playerUrls, ...adminUrls];
  app.enableCors({
    origin: (origin, callback) => {
      if (originAllowed(origin, allowedOrigins)) {
        return callback(null, true);
      }
      // P2-110 (run #137): denied origins are CLASSIFIED, not silenced. Probe-
      // shaped origins (RFC 2606 reserved TLDs, known scanner payload hosts)
      // get a `CORS_PROBE_BLOCKED:` message that main.ts's Sentry beforeSend
      // drops — scanner noise (130 events/24h) stops burying real errors. Any
      // OTHER denied origin keeps the original message and STILL captures: a
      // denied infra-shaped origin (Tailscale IP, LAN host, real domain) is a
      // deployment misconfiguration worth a Sentry event. The deny MUST keep
      // throwing either way (P2-201): `callback(null, false)` would let the
      // request execute routes (side effects!) while only the browser hides
      // the response.
      callback(new HttpException(corsDenyMessage(origin), HttpStatus.FORBIDDEN));
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

  // ── Root /health alias (bypasses the /api/v1 prefix) ─────────────────────
  // Probes (Coolify/Traefik/uptime monitors) that hit GET /health instead of
  // the prefixed GET /api/v1/health would otherwise 404. Mirror the liveness
  // response so any prober gets 200 regardless of which path it uses.
  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (b: unknown) => void }) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Swagger (Cookie-Auth configured) — DEV ONLY ──────────────────────────
  // Security audit run-1 (fingerprint: api-auth:swagger-unconditional-exposure):
  // the OpenAPI document + UI were served unconditionally, publishing the full
  // route/DTO surface to unauthenticated callers in production. Registered only
  // outside production now; prod returns 404 on /api/docs (verification folded
  // into the audit report).
  if (configService.get<string>('NODE_ENV') !== 'production') {
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
  }

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
