import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpStoreService } from './otp-store.service';
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
  controllers: [AuthController],
  providers: [AuthService, OtpStoreService, UnifonicService, JwtCookieStrategy],
  // P1-19 (run #44): OtpStoreService + UnifonicService are exported so
  // UsersService (phone-change flow) injects the SAME singletons AuthService
  // uses — shared abuse-cap counters require a shared cache-backed store.
  exports: [JwtModule, PassportModule, OtpStoreService, UnifonicService],
})
export class AuthModule {}
