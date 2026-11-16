import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ListMyReportsDto } from './dto/list-my-reports.dto';

@ApiTags('reports')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Run #181 (Reviewer A I-3): abuse-sensitive write — rode only the global
  // 60/min cap, permitting sustained report-spam from one account. 5/min/IP
  // keeps genuine multi-report flows (one per bad actor) comfortably above.
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a user, match, or venue' })
  @ApiCreatedResponse({ description: 'Report created.' })
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateReportDto) {
    return this.reports.create(user.sub, dto);
  }

  /** P2-23: the caller's own reports with their moderation outcomes. */
  @Get()
  @ApiOperation({ summary: 'List my reports (reporter closure surface)' })
  listMine(@CurrentUser() user: { sub: string }, @Query() query: ListMyReportsDto) {
    return this.reports.listMine(user.sub, query);
  }
}
