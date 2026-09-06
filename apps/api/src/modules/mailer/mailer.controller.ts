import {
  Controller,
  Get,
  Query,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MailerUsersService } from './mailer-users.service';
import { SetEmailDto } from './dto/set-email.dto';

@ApiTags('email')
@Controller('email')
export class MailerController {
  constructor(private readonly mailerUsers: MailerUsersService) {}

  /**
   * Set/replace the account email (auth: JWT cookie). Clears verification
   * and sends the verification+welcome email. Errors: invalid → 400,
   * already-in-use → 409.
   */
  @Patch('me')
  @UseGuards(JwtCookieAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or replace the account email (sends a verification email)' })
  async setEmail(@CurrentUser() user: { sub: string }, @Body() dto: SetEmailDto) {
    // Run #36 (Reviewer A): domain errors are typed exceptions from the
    // service (400 invalid / 409 taken / 404 no-user) and propagate as-is.
    // Only genuinely unknown failures fall back to 400 — a DB outage or
    // other unexpected error is NOT misrepresented as a client mistake;
    // those bubble to the global exception filter (500 + Sentry).
    return this.mailerUsers.setEmail(user.sub, dto.email);
  }

  /**
   * Re-send the verification email for the current address (throttled 3/min).
   * NO_EMAIL → 400; already-verified returns {verificationSent: false}.
   */
  @Patch('me/resend')
  @UseGuards(JwtCookieAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-send the email verification email' })
  async resend(@CurrentUser() user: { sub: string }) {
    try {
      return await this.mailerUsers.resendVerification(user.sub);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NO_EMAIL') {
        throw new BadRequestException('No email on file for this account.');
      }
      if (msg === 'USER_NOT_FOUND') {
        throw new NotFoundException('User not found.');
      }
      throw err;
    }
  }

  /**
   * Consume a verification link (opened from the email). Renders a
   * self-contained bilingual HTML page — 200 on success, 400 on any
   * invalid/stale/deleted state. Public by design (email link).
   */
  @Get('verify')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Verify an email address via the emailed link (HTML page)' })
  async verifyPage(@Query('token') token: string): Promise<string> {
    if (!token || typeof token !== 'string') {
      return this.mailerUsers.verifyErrorPage('invalid');
    }
    try {
      const { email } = await this.mailerUsers.verifyEmail(token);
      return this.mailerUsers.verifySuccessPage(email);
    } catch (err) {
      const msg = (err as Error).message;
      const reason =
        msg === 'TOKEN_STALE' ? 'stale' : msg === 'USER_NOT_FOUND' ? 'deleted' : 'invalid';
      return this.mailerUsers.verifyErrorPage(reason);
    }
  }
}
