import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';

import { MatchesService } from './matches.service';
import { GetMatchesDto } from './dto/get-matches.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';

@ApiTags('matches')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  // ── GET /matches — Discovery feed ─────────────────────────────────────
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({
    summary: 'Discover nearby open matches (PostGIS geo-filter)',
  })
  @ApiOkResponse({ description: 'Paginated list of nearby open matches.' })
  findNearby(@Query() dto: GetMatchesDto) {
    return this.matchesService.findNearby(dto);
  }

  // ── GET /matches/:id — Match details ──────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get full match details including lobby roster' })
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }
}
