import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Patch,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { DevLoginDto } from './dto/dev-login.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const COOKIE_NAME = 'access_token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // ── POST /auth/send-otp ──────────────────────────────────────────────────
  // P2-19 (run #22): route-level cap — 3 sends/min/IP on top of the global
  // 60/min and the per-phone caps in otp-store (60s cooldown, 10 SMS/day,
  // 5-fail lockout). Bounds SMS pumping from distributed loops.
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Send a one-time password via Unifonic SMS' })
  @ApiOkResponse({ description: 'OTP sent successfully.' })
  @ApiBadRequestResponse({ description: 'Invalid Saudi phone number.' })
  async sendOtp(@Body() dto: SendOtpDto) {
    await this.authService.sendOtp(dto.phone);
    return { message: 'OTP sent.' };
  }

  // ── POST /auth/verify-otp ────────────────────────────────────────────────
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP and receive an HttpOnly session cookie',
  })
  @ApiOkResponse({
    description:
      'OTP verified. Sets an `access_token` HttpOnly cookie. ' +
      'No JWT is returned in the response body.',
  })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, isNewUser } = await this.authService.verifyOtp(
      dto.phone,
      dto.code,
      dto.surface,
    );

    const isProd =
      this.configService.get<string>('NODE_ENV') === 'production';

    // Issue the JWT exclusively as an HttpOnly cookie — never in the body.
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: SEVEN_DAYS_MS,
      path: '/',
    });

    // P2-11 (run #22): the JWT rides ONLY the HttpOnly cookie — never the
    // response body, dev or prod. The PWA reads the cookie; scripts use
    // dev-login for a token. (Swagger contract already said "No JWT is
    // returned in the response body".)
    return { isNewUser };
  }

  // ── POST /auth/complete-profile ──────────────────────────────────────────
  @Patch('complete-profile')
  @UseGuards(JwtCookieAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Complete player profile after first login' })
  async completeProfile(
    @CurrentUser() user: { sub: string },
    @Body() dto: CompleteProfileDto,
  ) {
    return this.authService.completeProfile(user.sub, dto);
  }

  // ── POST /auth/dev-login — DEV ONLY — bypass SMS OTP ─────────────────────
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[DEV ONLY] Login as a seeded user by phone. Sets auth cookie directly.',
  })
  async devLogin(
    @Body() dto: DevLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const isProd =
      this.configService.get<string>('NODE_ENV') === 'production';
    if (isProd) {
      throw new ForbiddenException('dev-login is disabled in production');
    }

    const token = await this.authService.devLogin(dto.phone, dto.surface);

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: SEVEN_DAYS_MS,
      path: '/',
    });

    return { message: 'Dev login successful.', token };
  }
}
