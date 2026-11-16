import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';
import { ListVenueReviewsDto } from './dto/list-venue-reviews.dto';
import {
  AdminReviewsService,
  VenueReviewListResponse,
  VenueReviewRow,
} from './reviews.service';

@Controller('admin/venue-reviews')
@UseGuards(AdminAuthGuard)
export class AdminReviewsController {
  constructor(private readonly reviews: AdminReviewsService) {}

  @Get()
  list(@Query() dto: ListVenueReviewsDto): Promise<VenueReviewListResponse> {
    return this.reviews.list(dto);
  }

  @Post(':id/hide')
  @HttpCode(200)
  hide(@Param('id', UuidParamPipe) id: string, @Req() req: Request): Promise<VenueReviewRow> {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.reviews.hide(id, adminId, req.ip);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id', UuidParamPipe) id: string, @Req() req: Request): Promise<VenueReviewRow> {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.reviews.restore(id, adminId, req.ip);
  }

  @Delete(':id')
  remove(@Param('id', UuidParamPipe) id: string, @Req() req: Request): Promise<VenueReviewRow> {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.reviews.remove(id, adminId, req.ip);
  }
}
