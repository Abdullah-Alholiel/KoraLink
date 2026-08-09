import { Controller, Get, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';

import { VenuesService } from './venues.service';
import { GetVenuesDto } from './dto/get-venues.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';

@ApiTags('venues')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  // ── GET /venues — Nearby venues (PostGIS geo-filter) ──────────────────
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
  @ApiOperation({ summary: 'Discover nearby approved venues (PostGIS geo-filter)' })
  @ApiOkResponse({ description: 'List of nearby approved venues.' })
  findNearby(@Query() dto: GetVenuesDto) {
    return this.venuesService.findNearby(dto);
  }

  // ── GET /venues/:id — Venue details ───────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get full venue details including pitches' })
  @ApiOkResponse({ description: 'Venue details with pitches.' })
  findOne(@Param('id') id: string) {
    return this.venuesService.findOne(id);
  }
}
