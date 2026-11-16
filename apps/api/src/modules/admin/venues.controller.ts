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
import { ListVenuesDto } from './dto/list-venues.dto';
import { VenueDecisionDto } from './dto/venue-decision.dto';
import { TransferVenueDto } from './dto/transfer-venue.dto';
import { UpdateVenueAdminDto } from './dto/update-venue-admin.dto';
import { AdminVenuesService } from './venues.service';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';

@Controller('admin/venues')
@UseGuards(AdminAuthGuard)
export class AdminVenuesController {
  constructor(private readonly venues: AdminVenuesService) {}

  @Get()
  list(@Query() dto: ListVenuesDto) {
    return this.venues.list(dto);
  }

  @Get(':id')
  findOne(@Param('id', UuidParamPipe) id: string) {
    return this.venues.findOne(id);
  }

  @Get(':id/verification')
  getVerification(@Param('id', UuidParamPipe) id: string) {
    return this.venues.getVerification(id);
  }

  @Post(':id/decision')
  decide(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: VenueDecisionDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.venues.decide(id, dto, adminId, req.ip);
  }

  @Patch(':id')
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateVenueAdminDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.venues.update(id, dto, adminId, req.ip);
  }

  @Post(':id/transfer-ownership')
  transferOwnership(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: TransferVenueDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.venues.transferOwnership(id, dto, adminId, req.ip);
  }
}
