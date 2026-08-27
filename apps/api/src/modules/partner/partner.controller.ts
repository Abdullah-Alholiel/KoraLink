import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PartnerService } from './partner.service';
import { CreatePitchDto } from './dto/create-pitch.dto';
import { UpdatePitchDto } from './dto/update-pitch.dto';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateSlotDto, GenerateSlotsDto, UpdateVenuePartnerDto } from './dto/slots.dto';

@Controller('partner')
@UseGuards(JwtCookieAuthGuard, RolesGuard)
@Roles('VenueOwner', 'Admin')
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: { sub: string; role: string }) {
    return this.partner.getDashboard(user.sub, user.role);
  }

  @Get('venues')
  venues(@CurrentUser() user: { sub: string; role: string }) {
    return this.partner.getVenues(user.sub, user.role);
  }

  @Post('venues')
  createVenue(@CurrentUser() user: { sub: string }, @Body() dto: CreateVenueDto) {
    return this.partner.createVenue(user.sub, dto);
  }

  @Patch('venues/:id')
  updateVenue(
    @CurrentUser() user: { sub: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdateVenuePartnerDto,
  ) {
    return this.partner.updateVenue(user.sub, user.role, id, dto);
  }

  // ── Slot management (owner of the pitch; Admin bypasses) ────────────────

  @Get('pitches/:id/slots')
  listSlots(
    @CurrentUser() user: { sub: string; role: string },
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.partner.listSlots(user.sub, user.role, id, from, to);
  }

  @Post('pitches/:id/slots/generate')
  generateSlots(
    @CurrentUser() user: { sub: string; role: string },
    @Param('id') id: string,
    @Body() dto: GenerateSlotsDto,
  ) {
    return this.partner.generateSlots(user.sub, user.role, id, dto);
  }

  @Post('pitches/:id/slots')
  createSlot(
    @CurrentUser() user: { sub: string; role: string },
    @Param('id') id: string,
    @Body() dto: CreateSlotDto,
  ) {
    return this.partner.createSlot(user.sub, user.role, id, dto);
  }

  @Delete('slots/:slotId')
  deleteSlot(
    @CurrentUser() user: { sub: string; role: string },
    @Param('slotId') slotId: string,
  ) {
    return this.partner.deleteSlot(user.sub, user.role, slotId);
  }

  @Get('pitches')
  pitches(@CurrentUser() user: { sub: string; role: string }) {
    return this.partner.getPitches(user.sub, user.role);
  }

  @Post('pitches')
  createPitch(@CurrentUser() user: { sub: string }, @Body() dto: CreatePitchDto) {
    return this.partner.createPitch(user.sub, dto);
  }

  @Patch('pitches/:id')
  updatePitch(
    @CurrentUser() user: { sub: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdatePitchDto,
  ) {
    return this.partner.updatePitch(user.sub, user.role, id, dto);
  }

  @Delete('pitches/:id')
  deletePitch(
    @CurrentUser() user: { sub: string; role: string },
    @Param('id') id: string,
  ) {
    return this.partner.deletePitch(user.sub, user.role, id);
  }

  @Get('earnings')
  earnings(@CurrentUser() user: { sub: string; role: string }) {
    return this.partner.getEarnings(user.sub, user.role);
  }

  @Get('verification')
  getVerification(@CurrentUser() user: { sub: string }) {
    return this.partner.getVerification(user.sub);
  }

  @Put('verification')
  submitVerification(
    @CurrentUser() user: { sub: string },
    @Body() dto: SubmitVerificationDto,
  ) {
    return this.partner.submitVerification(user.sub, dto);
  }
}
