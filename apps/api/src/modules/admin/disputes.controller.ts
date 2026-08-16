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
import { ListDisputesDto } from './dto/list-disputes.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { AdminDisputesService } from './disputes.service';

@Controller('admin/disputes')
@UseGuards(AdminAuthGuard)
export class AdminDisputesController {
  constructor(private readonly disputes: AdminDisputesService) {}

  @Get()
  list(@Query() dto: ListDisputesDto) {
    return this.disputes.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.disputes.findOne(id);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.disputes.resolve(id, dto, adminId, req.ip);
  }
}
