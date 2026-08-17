import {
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
import { ListSettlementsDto } from './dto/list-settlements.dto';
import { AdminSettlementsService } from './settlements.service';

@Controller('admin/settlements')
@UseGuards(AdminAuthGuard)
export class AdminSettlementsController {
  constructor(private readonly settlements: AdminSettlementsService) {}

  @Get()
  list(@Query() dto: ListSettlementsDto) {
    return this.settlements.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.settlements.findOne(id);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.settlements.pay(id, adminId, req.ip);
  }

  @Post('generate')
  generate(@Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.settlements.generatePending(adminId, req.ip);
  }
}
