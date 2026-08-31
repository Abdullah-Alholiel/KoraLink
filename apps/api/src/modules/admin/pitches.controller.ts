import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { ListPitchesDto } from './dto/list-pitches.dto';
import { UpdatePitchAdminDto } from './dto/update-pitch-admin.dto';
import { AdminPitchesService } from './pitches.service';

@Controller('admin/pitches')
@UseGuards(AdminAuthGuard)
export class AdminPitchesController {
  constructor(private readonly pitches: AdminPitchesService) {}

  @Get()
  list(@Query() dto: ListPitchesDto) {
    return this.pitches.list(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePitchAdminDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.pitches.update(id, dto, adminId, req.ip);
  }
}
