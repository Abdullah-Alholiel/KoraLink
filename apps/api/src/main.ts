import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ── Structured JSON logger (OCI-ready) ──────────────────────────────────
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const playerUrl = configService.get<string>('PLAYER_URL', 'http://localhost:3000');
  const adminUrl = configService.get<string>('ADMIN_URL', 'http://localhost:3002');
  const port = configService.get<number>('PORT', 3001);
  const cookieSecret = configService.get<string>('COOKIE_SECRET', 'change-me');

  // ── Security middleware ──────────────────────────────────────────────────
  app.use(helmet());
  app.use(cookieParser(cookieSecret));

  // ── CORS — HttpOnly cookies require credentials: true ───────────────────
  app.enableCors({
    origin: [playerUrl, adminUrl],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
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

  await app.listen(port);
}

bootstrap();
