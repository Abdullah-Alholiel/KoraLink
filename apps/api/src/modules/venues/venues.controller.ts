import { Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';

import { VenuesService } from './venues.service';
import { GetVenuesDto } from './dto/get-venues.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('venues')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  // ── GET /venues/suggestions — city + neighborhood suggestion chips ────
  // MUST stay ABOVE /venues/suggestions or "suggestions" is captured as :id.
  // Parameterless + NATIONWIDE (2026-09-18 chips redesign): the client
  // fetches once, caches 5min, and filters per keystroke locally — no
  // per-keystroke API load, and chips for ANY city regardless of the
  // user's location.
  @Get('suggestions')
  @ApiOperation({
    summary:
      'Popular city + neighborhood suggestions from approved venues (search bar chips)',
  })
  @ApiOkResponse({
    description: 'Ranked { city, neighborhood, venue_count } rows (max 50).',
  })
  suggestions() {
    return this.venuesService.findSuggestions();
  }

  // ── GET /venues — Nearby venues (PostGIS geo-filter) ──────────────────
  // NOTE: No cache interceptor — query params (lat, lng, city) vary per user.
  @Get()
  @ApiOperation({ summary: 'Discover nearby approved venues (PostGIS geo-filter)' })
  @ApiOkResponse({ description: 'List of nearby approved venues.' })
  findNearby(@Query() dto: GetVenuesDto) {
    return this.venuesService.findNearby(dto);
  }

  // ── GET /venues/favorites — the caller's saved venues (P2-161, run #109) ─
  // MUST stay ABOVE GET /venues/:id or "favorites" is captured as :id (same
  // rule as /suggestions above).
  @Get('favorites')
  @ApiOperation({ summary: 'List the authenticated user\'s favorite venues' })
  @ApiOkResponse({ description: 'Favorite venues, newest-first (findNearby row shape).' })
  listFavorites(@CurrentUser() user: { sub: string }) {
    return this.venuesService.listFavoriteVenues(user.sub);
  }

  // ── GET /venues/favorites/ids — heart-state id set (P2-161) ─────────────
  // Two segments, so :id cannot shadow it, but declared here to keep the
  // favorites surface together.
  @Get('favorites/ids')
  @ApiOperation({ summary: 'List the authenticated user\'s favorited venue ids (newest-first)' })
  @ApiOkResponse({ description: 'Array of venue ids.' })
  listFavoriteIds(@CurrentUser() user: { sub: string }) {
    return this.venuesService.listFavoriteIds(user.sub);
  }

  // ── POST /venues/:id/favorite — idempotent save (P2-161) ────────────────
  @Post(':id/favorite')
  @ApiOperation({ summary: 'Favorite a venue (idempotent)' })
  @ApiOkResponse({
    description: '{ favorited: true, created } — created=true only when newly inserted.',
  })
  addFavorite(@Param('id', UuidParamPipe) id: string, @CurrentUser() user: { sub: string }) {
    return this.venuesService.addFavorite(user.sub, id);
  }

  // ── DELETE /venues/:id/favorite — idempotent unsave (P2-161) ────────────
  @Delete(':id/favorite')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unfavorite a venue (idempotent, never 404s on a missing row)' })
  @ApiOkResponse({
    description: '{ favorited: false, removed } — removed=true only when a row was deleted.',
  })
  removeFavorite(@Param('id', UuidParamPipe) id: string, @CurrentUser() user: { sub: string }) {
    return this.venuesService.removeFavorite(user.sub, id);
  }

  // ── GET /venues/:id — Venue details ───────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get full venue details including pitches' })
  @ApiOkResponse({ description: 'Venue details with pitches.' })
  findOne(@Param('id', UuidParamPipe) id: string) {
    return this.venuesService.findOne(id);
  }
}
