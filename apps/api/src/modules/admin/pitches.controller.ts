import {
  Body,
  Controller,
  Delete,
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
import { ListPitchesDto } from './dto/list-pitches.dto';
import { UpdatePitchAdminDto } from './dto/update-pitch-admin.dto';
import { AdminPitchesService } from './pitches.service';
import { CreateSlotDto, GenerateSlotsDto } from '../partner/dto/slots.dto';

@Controller('admin/pitches')
@UseGuards(AdminAuthGuard)
export class AdminPitchesController {
  constructor(private readonly pitches: AdminPitchesService) {}

  @Get()
  list(@Query() dto: ListPitchesDto) {
    return this.pitches.list(dto);
  }

  // ── Schedule management (admin acts on user/partner feedback) ─────────

  @Get(':id/slots')
  listSlots(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.pitches.listSlots(id, from, to);
  }

  @Post(':id/slots/generate')
  generateSlots(
    @Param('id') id: string,
    @Body() dto: GenerateSlotsDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.pitches.generateSlots(id, dto, adminId, req.ip);
  }

  @Post(':id/slots')
  createSlot(
    @Param('id') id: string,
    @Body() dto: CreateSlotDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.pitches.createSlot(id, dto, adminId, req.ip);
  }

  @Delete('slots/:slotId')
  deleteSlot(@Param('slotId') slotId: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.pitches.deleteSlot(slotId, adminId, req.ip);
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

/**
 * Admin slot deletion lives under /admin/slots (not /admin/pitches/...) so
 * the FE can reuse the same SlotManager paths as the partner portal
 * (/partner/slots/:id vs /admin/slots/:id).
 */
@Controller('admin/slots')
@UseGuards(AdminAuthGuard)
export class AdminSlotsController {
  constructor(private readonly pitches: AdminPitchesService) {}

  @Delete(':slotId')
  deleteSlot(@Param('slotId') slotId: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.pitches.deleteSlot(slotId, adminId, req.ip);
  }
}
