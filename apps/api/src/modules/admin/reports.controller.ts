import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { ListReportsDto } from './dto/list-reports.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { AdminReportsService } from './reports.service';

@Controller('admin/reports')
@UseGuards(AdminAuthGuard)
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  list(@Query() dto: ListReportsDto) {
    return this.reports.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reports.findOne(id);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.reports.resolve(id, dto, adminId, req.ip);
  }
}
