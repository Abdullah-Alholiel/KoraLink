import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Patch,
  Body,
  Query,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';

import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePushPreferencesDto } from './dto/update-push-preferences.dto';
import { RequestPhoneChangeDto } from './dto/request-phone-change.dto';
import { VerifyPhoneChangeDto } from './dto/verify-phone-change.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── GET /users/search?q= — Search users ──────────────────
  // Must be defined BEFORE `:id` routes to avoid collision
  @Get('search')
  @ApiOperation({ summary: 'Search users by name or handle' })
  @ApiOkResponse({ description: 'Matching users.' })
  searchUsers(@Query('q') q: string) {
    return this.usersService.searchUsers(q);
  }

  // ── GET /users/me ──────────────────────────────────────
  @Get('me')
  @ApiOperation({ summary: 'Get authenticated user profile with stats' })
  @ApiOkResponse({ description: 'User profile data.' })
  getProfile(@CurrentUser() user: { sub: string }) {
    return this.usersService.getProfile(user.sub);
  }

  // ── GET /users/me/stats ─────────────────────────────────
  @Get('me/stats')
  @ApiOperation({ summary: 'Get authenticated user game stats' })
  @ApiOkResponse({ description: 'User stats summary.' })
  getStats(@CurrentUser() user: { sub: string }) {
    return this.usersService.getStats(user.sub);
  }

  // ── GET /users/me/matches ───────────────────────────────
  @Get('me/matches')
  @ApiOperation({ summary: 'Get matches the user has joined' })
  @ApiOkResponse({ description: 'List of joined matches.' })
  getMyMatches(@CurrentUser() user: { sub: string }) {
    return this.usersService.getMyMatches(user.sub);
  }

  // ── GET /users/me/discussions ────────────────────────────
  @Get('me/discussions')
  @ApiOperation({ summary: 'Get unified discussion list for Messages screen' })
  @ApiOkResponse({ description: 'Discussions with last message preview.' })
  getMyDiscussions(@CurrentUser() user: { sub: string }) {
    return this.usersService.getMyDiscussions(user.sub);
  }

  // ── PATCH /users/me ────────────────────────────────────
  @Patch('me')
  @ApiOperation({ summary: 'Update authenticated user profile' })
  @ApiOkResponse({ description: 'Updated user profile.' })
  updateProfile(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  // ── PATCH /users/me/push-preferences — P1-20 (run #13) + P0-5 (run #28) ──
  @Patch('me/push-preferences')
  @ApiOperation({ summary: 'Update push delivery preferences (mute, quiet hours, per-category)' })
  @ApiOkResponse({ description: 'Full push preference set after the update.' })
  updatePushPreferences(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdatePushPreferencesDto,
  ) {
    return this.usersService.updatePushPreferences(user.sub, dto);
  }

  // ── GET /users/me/push-preferences — P0-5 (run #28) ─────────────────
  // Companion read so the PWA can rehydrate prefs on cold load (the Zustand
  // store doesn't carry the field; the profile page already fetches
  // /users/me so adding a parallel call would be wasteful — this lives on
  // the same handler for free).
  @Get('me/push-preferences')
  @ApiOperation({ summary: 'Read the authenticated user\'s push preferences' })
  @ApiOkResponse({ description: 'Full push preference set.' })
  getPushPreferences(@CurrentUser() user: { sub: string }) {
    return this.usersService.getPushPreferences(user.sub);
  }

  // ── POST /users/me/change-phone/request — P1-19 (run #44) ───────────
  // Step 1 of the lost-SIM recovery flow: dispatch a fresh OTP to the NEW
  // number under the scoped otp:change:* key. Auth-guarded (the caller still
  // has their OLD session); abuse caps (60s cooldown, 10/day/phone,
  // 50/day/IP) are the SAME counters the login flow uses — one SMS budget.
  // 409 when the new number is already registered (localized client-side
  // via errors.conflict + profile.changePhoneNumberTaken).
  @Post('me/change-phone/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({
    summary: 'Request an OTP for changing the account phone number',
  })
  @ApiOkResponse({ description: 'OTP dispatched to the new number.' })
  @ApiBadRequestResponse({ description: 'Invalid Saudi phone number, or number already in use.' })
  requestPhoneChange(
    @CurrentUser() user: { sub: string },
    @Body() dto: RequestPhoneChangeDto,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? undefined;
    return this.usersService.requestPhoneChange(user.sub, dto.phone, ip);
  }

  // ── POST /users/me/change-phone/verify — P1-19 (run #44) ────────────
  // Step 2: consume the OTP, flip users.phone, write the audit activity
  // (verb phone_changed, migration 0037). Returns the same populated
  // profile shape as PATCH /users/me so the client reconciles in one
  // round-trip. Live JWTs stay valid (session resolves by `sub`).
  @Post('me/change-phone/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Verify the OTP and move the account to the new number' })
  @ApiOkResponse({ description: 'Updated profile (same shape as PATCH /users/me).' })
  @ApiBadRequestResponse({ description: 'Invalid or expired OTP.' })
  verifyPhoneChange(
    @CurrentUser() user: { sub: string },
    @Body() dto: VerifyPhoneChangeDto,
  ) {
    return this.usersService.verifyPhoneChange(user.sub, dto.phone, dto.code);
  }

  // ── GET /users/:id — Public profile ──────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile by ID' })
  @ApiOkResponse({ description: 'Public user profile.' })
  getPublicProfile(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
    return this.usersService.getPublicProfile(id, user.sub);
  }

  // ── DELETE /users/me — P0-6 PDPL soft-delete (run #29) ────
  // Idempotent: a second call returns the existing deleted_at. The
  // response includes a `restore_token` (purpose: 'restore' JWT) the
  // PWA persists and uses to call POST /users/me/restore within the
  // 30-day grace window.
  @Delete('me')
  @ApiOperation({
    summary: 'PDPL soft-delete account (30-day grace before hard purge)',
  })
  @ApiOkResponse({
    description: 'Deletion scheduled; restore_token is a one-time JWT for restore.',
  })
  deleteMyAccount(@CurrentUser() user: { sub: string }) {
    return this.usersService.softDelete(user.sub);
  }

  // ── POST /users/me/restore — P0-6 PDPL restore (run #29) ──
  // Idempotent on an active user (returns populated profile). On a
  // deleted user, sets deleted_at = NULL and returns the populated
  // profile. Requires a JWT with purpose: 'restore' (or an active
  // session — idempotent no-op path).
  @Post('me/restore')
  @ApiOperation({ summary: 'PDPL restore (only valid within 30-day grace window)' })
  @ApiOkResponse({ description: 'Restored profile (or current profile if not deleted).' })
  restoreMyAccount(@CurrentUser() user: { sub: string }) {
    return this.usersService.restoreUser(user.sub);
  }

  // ── GET /users/me/export — P0-6 PDPL data export (run #29) ──
  // Returns a JSON envelope of 8 data groups (profile, matches, wallet,
  // transactions, disputes, reports, activities, push_subscriptions).
  // Profile + push_subscriptions are redacted (no internal columns,
  // no device crypto). The PWA downloads as a file.
  @Get('me/export')
  @ApiOperation({ summary: 'PDPL data export (downloadable JSON of all user data)' })
  @ApiOkResponse({ description: 'A JSON envelope of the user\'s data groups.' })
  async exportMyData(
    @CurrentUser() user: { sub: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.usersService.exportUserData(user.sub);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="koralink-export-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return data;
  }
}
