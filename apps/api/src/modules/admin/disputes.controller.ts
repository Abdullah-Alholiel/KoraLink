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
import { ListDisputesDto } from './dto/list-disputes.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { PostDisputeMessageDto } from './dto/post-dispute-message.dto';
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

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.disputes.reopen(id, adminId, req.ip);
  }

  @Post(':id/messages')
  addMessage(
    @Param('id') id: string,
    @Body() dto: PostDisputeMessageDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.disputes.addMessage(id, dto.content, adminId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDisputeDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.disputes.update(id, dto, adminId, req.ip);
  }
}
