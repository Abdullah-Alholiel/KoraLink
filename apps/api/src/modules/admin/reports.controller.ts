import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { ListReportsDto } from './dto/list-reports.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { AdminReportsService } from './reports.service';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';

@Controller('admin/reports')
@UseGuards(AdminAuthGuard)
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get()
  list(@Query() dto: ListReportsDto) {
    return this.reports.list(dto);
  }

  @Get(':id')
  findOne(@Param('id', UuidParamPipe) id: string) {
    return this.reports.findOne(id);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ResolveReportDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.reports.resolve(id, dto, adminId, req.ip);
  }

  @Post(':id/reopen')
  reopen(@Param('id', UuidParamPipe) id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.reports.reopen(id, adminId, req.ip);
  }

  @Patch(':id')
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateReportDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.reports.update(id, dto, adminId, req.ip);
  }
}
