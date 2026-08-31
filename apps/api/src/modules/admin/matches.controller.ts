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
import { ListMatchesDto } from './dto/list-matches.dto';
import { UpdateMatchAdminDto } from './dto/update-match-admin.dto';
import { AdminMatchesService } from './matches.service';

@Controller('admin/matches')
@UseGuards(AdminAuthGuard)
export class AdminMatchesController {
  constructor(private readonly matches: AdminMatchesService) {}

  @Get()
  list(@Query() dto: ListMatchesDto) {
    return this.matches.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.matches.findOne(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.matches.cancel(id, adminId, req.ip);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMatchAdminDto, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.matches.update(id, dto, adminId, req.ip);
  }
}
