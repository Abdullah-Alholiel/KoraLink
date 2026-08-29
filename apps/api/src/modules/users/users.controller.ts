import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';

import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePushPreferencesDto } from './dto/update-push-preferences.dto';
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

  // ── PATCH /users/me/push-preferences — P1-20 (run #13) ──
  @Patch('me/push-preferences')
  @ApiOperation({ summary: 'Update push delivery preferences (mute, quiet hours)' })
  @ApiOkResponse({ description: 'Full push preference set after the update.' })
  updatePushPreferences(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdatePushPreferencesDto,
  ) {
    return this.usersService.updatePushPreferences(user.sub, dto);
  }

  // ── GET /users/:id — Public profile ──────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile by ID' })
  @ApiOkResponse({ description: 'Public user profile.' })
  getPublicProfile(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
    return this.usersService.getPublicProfile(id, user.sub);
  }
}
