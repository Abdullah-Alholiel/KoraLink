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
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { AdminTransactionsService } from './transactions.service';

@Controller('admin/transactions')
@UseGuards(AdminAuthGuard)
export class AdminTransactionsController {
  constructor(private readonly transactions: AdminTransactionsService) {}

  @Get()
  list(@Query() dto: ListTransactionsDto) {
    return this.transactions.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactions.findOne(id);
  }

  @Post(':id/refund')
  refund(@Param('id') id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.transactions.refund(id, adminId, req.ip);
  }
}
