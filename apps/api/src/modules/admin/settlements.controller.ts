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
import { GenerateSettlementsDto } from './dto/generate-settlements.dto';
import { ListSettlementsDto } from './dto/list-settlements.dto';
import { AdminSettlementsService } from './settlements.service';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';

// P2-295 (run #185, Reviewer A run-#181 follow-through): admin MONEY ops carry
// an explicit route-level 10/min cap instead of riding the global 60/min —
// same posture as the wallet POSTs (topup/verify) and admin/metrics (P2-248).
const MONEY_OP_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

@Controller('admin/settlements')
@UseGuards(AdminAuthGuard)
export class AdminSettlementsController {
  constructor(private readonly settlements: AdminSettlementsService) {}

  @Get()
  list(@Query() dto: ListSettlementsDto) {
    return this.settlements.list(dto);
  }

  @Get(':id')
  findOne(@Param('id', UuidParamPipe) id: string) {
    return this.settlements.findOne(id);
  }

  @Post(':id/pay')
  @Throttle(MONEY_OP_THROTTLE)
  pay(@Param('id', UuidParamPipe) id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.settlements.pay(id, adminId, req.ip);
  }

  // P2-285 (run #195): void a pending settlement — same money-op posture as
  // pay/generate (10/min route-level cap, audit-backed, owner decision
  // D-20261106-03).
  @Post(':id/void')
  @Throttle(MONEY_OP_THROTTLE)
  void(@Param('id', UuidParamPipe) id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.settlements.void(id, adminId, req.ip);
  }

  @Post('generate')
  @Throttle(MONEY_OP_THROTTLE)
  generate(@Query() dto: GenerateSettlementsDto, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.settlements.generatePending(adminId, req.ip, dto.venueId);
  }
}
