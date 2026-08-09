import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
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
import { CreateMatchDto } from './dto/create-match.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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

  // ── POST /matches — Create (host) a match ─────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Host a new match' })
  @ApiOkResponse({ description: 'Match created successfully.' })
  createMatch(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateMatchDto,
  ) {
    return this.matchesService.createMatch(user.sub, dto);
  }

  // ── POST /matches/:id/join — Join a match ─────────────────────────────
  @Post(':id/join')
  @ApiOperation({ summary: 'Join a match as a player' })
  @ApiOkResponse({ description: 'Successfully joined the match.' })
  joinMatch(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.matchesService.joinMatch(user.sub, id);
  }

  // ── DELETE /matches/:id/leave — Leave a match ─────────────────────────
  @Delete(':id/leave')
  @ApiOperation({ summary: 'Leave a match' })
  @ApiOkResponse({ description: 'Successfully left the match.' })
  leaveMatch(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.matchesService.leaveMatch(user.sub, id);
  }
}
