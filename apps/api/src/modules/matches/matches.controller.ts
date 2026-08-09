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
  ApiCreatedResponse,
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
  // NOTE: No cache interceptor here because query params (lat, lng, date)
  // vary per user; the default NestJS cache key is only the route path,
  // which would serve stale cached results to different users.
  @Get()
  @ApiOperation({
    summary: 'Discover nearby open matches (PostGIS geo-filter)',
  })
  @ApiOkResponse({ description: 'Paginated list of nearby open matches.' })
  findNearby(@CurrentUser() user: { sub: string }, @Query() dto: GetMatchesDto) {
    return this.matchesService.findNearby(dto, user.sub);
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
  @ApiCreatedResponse({ description: 'Match created successfully.' })
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

  // ── GET /matches/:id/messages — Match chat history ────────────────────
  @Get(':id/messages')
  @ApiOperation({ summary: 'Get match chat message history' })
  @ApiOkResponse({ description: 'Paginated chat messages for a match.' })
  getMessages(@Param('id') id: string) {
    return this.matchesService.getMessages(id);
  }

  // ── POST /matches/:id/start — Start a match (host only) ────────────────
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the match (Full → InProgress). Host only.' })
  @ApiOkResponse({ description: 'Match started successfully.' })
  startMatch(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.matchesService.startMatch(user.sub, id);
  }

  // ── POST /matches/:id/complete — Complete a match (host only) ──────────
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete the match (InProgress → Completed). Host only.' })
  @ApiOkResponse({ description: 'Match completed successfully.' })
  completeMatch(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.matchesService.completeMatch(user.sub, id);
  }

  // ── POST /matches/:id/cancel — Cancel a match (host only) ──────────────
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel the match (Open/Full → Cancelled). Host only.' })
  @ApiOkResponse({ description: 'Match cancelled successfully.' })
  cancelMatch(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.matchesService.cancelMatch(user.sub, id);
  }
}
