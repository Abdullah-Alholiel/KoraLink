import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

@ApiTags('reports')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a user, match, or venue' })
  @ApiCreatedResponse({ description: 'Report created.' })
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateReportDto) {
    return this.reports.create(user.sub, dto);
  }
}
