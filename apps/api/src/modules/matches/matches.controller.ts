import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Delete,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
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
import { CastVoteDto } from './dto/cast-vote.dto';
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

  // ── GET /matches/:id/calendar — ICS file download ─────────────────────
  // Must come BEFORE `:id` to avoid route collision
  @Get(':id/calendar')
  @ApiOperation({ summary: 'Download match as ICS calendar file' })
  async getCalendar(
    @Param('id') id: string,
    @Query('format') format: 'ics' | 'google' = 'ics',
    @Res() res: Response,
  ) {
    const match = await this.matchesService.findOne(id);

    const startDate = new Date(match.scheduled_at);
    const endDate = new Date(startDate.getTime() + (match.duration_mins ?? 60) * 60 * 1000);

    const toICSDate = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    if (format === 'google') {
      const googleUrl = new URL('https://www.google.com/calendar/render');
      googleUrl.searchParams.set('action', 'TEMPLATE');
      googleUrl.searchParams.set('text', match.title);
      googleUrl.searchParams.set('dates', `${toICSDate(startDate)}/${toICSDate(endDate)}`);
      googleUrl.searchParams.set('details', `${match.match_type} ${match.gender_rule}`);
      const venueName = (match as any).pitch?.venue?.name ?? '';
      googleUrl.searchParams.set('location', venueName);
      return res.redirect(googleUrl.toString());
    }

    const venueName = (match as any).pitch?.venue?.name ?? '';
    const venueAddr = (match as any).pitch?.venue?.address ?? '';
    const location = [venueName, venueAddr].filter(Boolean).join(', ');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//KoraLink//Match Calendar//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${match.title}`,
      `DTSTART:${toICSDate(startDate)}`,
      `DTEND:${toICSDate(endDate)}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${match.match_type} \\u2022 ${match.gender_rule} \\u2022 Hosted on KoraLink`,
      `URL:https://koralink.app/match/${match.id}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="koralink-match-${id.slice(0, 8)}.ics"`);
    return res.send(ics);
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

  // ── POST /matches/:id/vote — Vote for Player of the Match ─────────────
  @Post(':id/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cast or update Player of the Match vote.' })
  @ApiOkResponse({ description: 'Vote recorded successfully.' })
  castVote(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: CastVoteDto,
  ) {
    return this.matchesService.castVote(user.sub, id, dto.candidateId);
  }

  // ── GET /matches/:id/pom-result — Player of the Match status ──────────
  @Get(':id/pom-result')
  @ApiOperation({ summary: 'Get Player of the Match voting status or result.' })
  @ApiOkResponse({ description: 'POM voting status or winner.' })
  getPomResult(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.matchesService.getPomResult(id, user.sub);
  }

  // ── POST /matches/:id/no-show — Mark player as no-show (host only) ──
  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark or unmark a player as no-show (Host only)' })
  @ApiOkResponse({ description: 'Attendance updated.' })
  markNoShow(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: { targetUserId: string; noShow: boolean },
  ) {
    return this.matchesService.markNoShow(user.sub, id, dto.targetUserId, dto.noShow);
  }
}
