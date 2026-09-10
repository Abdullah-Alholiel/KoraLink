import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { EmailAuthController } from './email-auth.controller';
import { AuthService } from './auth.service';
import { EmailOtpService } from './email-otp.service';
import { OtpStoreService } from './otp-store.service';
import { ResendService } from './resend.service';
import { BrevoService } from './brevo.service';
import { EMAIL_SENDER_PROVIDER } from './email-sender.provider';
import { UnifonicService } from './unifonic.service';
import { JwtCookieStrategy } from './jwt-cookie.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRY', '7d') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, EmailAuthController],
  providers: [
    AuthService,
    EmailOtpService,
    OtpStoreService,
    UnifonicService,
    ResendService,
    BrevoService,
    EMAIL_SENDER_PROVIDER,
    JwtCookieStrategy,
  ],
  // P1-19 (run #44): OtpStoreService + UnifonicService are exported so
  // UsersService (phone-change flow) injects the SAME singletons AuthService
  // uses — shared abuse-cap counters require a shared cache-backed store.
  // The EMAIL_SENDER port replaces the concrete ResendService export: the
  // future email-change flow consumes the port too, so provider swaps stay
  // env-only (EMAIL_PROVIDER=brevo|resend).
  exports: [
    JwtModule,
    PassportModule,
    OtpStoreService,
    UnifonicService,
    EMAIL_SENDER_PROVIDER,
  ],
})
export class AuthModule {}
