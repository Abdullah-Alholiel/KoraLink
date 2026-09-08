import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { EmailOtpService } from './email-otp.service';
import { EmailSendOtpDto, EmailVerifyOtpDto } from './dto/email-otp.dto';

const COOKIE_NAME = 'access_token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Email + OTP login (P0-9 / email-otp-login cycle).
 *
 * Contracts: docs/plans/email-otp-login/03-program-design.md.
 * Mirrors the phone flow's cookie semantics EXACTLY, with one documented
 * exception (P2-11): `responseToken: true` returns the JWT in the body,
 * because prod's cross-origin topology (render API ↔ vercel PWA) cannot
 * deliver a SameSite=strict cookie. Opt-in per request, off by default.
 */
@ApiTags('auth')
@Controller('auth/email')
export class EmailAuthController {
  constructor(
    private readonly emailOtpService: EmailOtpService,
    private readonly configService: ConfigService,
  ) {}

  // ── POST /auth/email/send-otp ────────────────────────────────────────
  // Same layered caps as the phone flow: 3/min/IP here + Redis-side
  // cooldown (60s), per-address daily (10) and per-IP daily (50) — keyed
  // `email:<addr>` in disjoint namespaces from the phone counters.
  // ALWAYS 202 with a non-committal body (anti-enumeration: the response
  // never reveals whether the address has an account).
  @Post('send-otp')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Send a one-time password via email (Resend)' })
  @ApiOkResponse({ description: 'Accepted — email dispatched if the address can receive login codes.' })
  @ApiBadRequestResponse({ description: 'Invalid email address.' })
  async sendEmailOtp(@Body() dto: EmailSendOtpDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? undefined;
    await this.emailOtpService.requestEmailOtp(dto.email.toLowerCase(), ip);
    return {
      message:
        'If that address can receive login codes, an email is on its way.',
    };
  }

  // ── POST /auth/email/verify-otp ──────────────────────────────────────
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email OTP and receive an HttpOnly session cookie',
  })
  @ApiOkResponse({
    description:
      'OTP verified. Sets the `access_token` HttpOnly cookie. The JWT is ' +
      'returned in the body ONLY when the request opted in with responseToken:true.',
  })
  async verifyEmailOtp(
    @Body() dto: EmailVerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = dto.email.toLowerCase();
    const { token, isNewUser } = await this.emailOtpService.verifyEmailOtp(
      email,
      dto.code,
      dto.surface,
    );

    const isProd =
      this.configService.get<string>('NODE_ENV') === 'production';

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: SEVEN_DAYS_MS,
      path: '/',
    });

    // P2-11 exception — explicit opt-in only. Default payload matches the
    // phone flow byte-for-byte: { isNewUser } and no token.
    return dto.responseToken === true ? { isNewUser, token } : { isNewUser };
  }
}
