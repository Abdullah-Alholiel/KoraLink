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
import { ListVenuesDto } from './dto/list-venues.dto';
import { VenueDecisionDto } from './dto/venue-decision.dto';
import { TransferVenueDto } from './dto/transfer-venue.dto';
import { AdminVenuesService } from './venues.service';

@Controller('admin/venues')
@UseGuards(AdminAuthGuard)
export class AdminVenuesController {
  constructor(private readonly venues: AdminVenuesService) {}

  @Get()
  list(@Query() dto: ListVenuesDto) {
    return this.venues.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.venues.findOne(id);
  }

  @Get(':id/verification')
  getVerification(@Param('id') id: string) {
    return this.venues.getVerification(id);
  }

  @Post(':id/decision')
  decide(
    @Param('id') id: string,
    @Body() dto: VenueDecisionDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.venues.decide(id, dto, adminId, req.ip);
  }

  @Post(':id/transfer-ownership')
  transferOwnership(
    @Param('id') id: string,
    @Body() dto: TransferVenueDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.venues.transferOwnership(id, dto, adminId, req.ip);
  }
}
