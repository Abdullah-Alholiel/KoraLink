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
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { AdminTransactionsService } from './transactions.service';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';

@Controller('admin/transactions')
@UseGuards(AdminAuthGuard)
export class AdminTransactionsController {
  constructor(private readonly transactions: AdminTransactionsService) {}

  @Get()
  list(@Query() dto: ListTransactionsDto) {
    return this.transactions.list(dto);
  }

  @Get(':id')
  findOne(@Param('id', UuidParamPipe) id: string) {
    return this.transactions.findOne(id);
  }

  // P2-295 follow-through (Reviewer A run #186): refund is a money mutation —
  // it rode only the global 60/min cap while settlements pay/generate carry
  // the MONEY_OP posture (10/min). Align it.
  @Post(':id/refund')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  refund(@Param('id', UuidParamPipe) id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.transactions.refund(id, adminId, req.ip);
  }
}
