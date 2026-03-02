import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Patch,
} from '@nestjs/common';
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
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
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
}
