import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
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
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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

  // ── GET /users/:id — Public profile ──────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile by ID' })
  @ApiOkResponse({ description: 'Public user profile.' })
  getPublicProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
