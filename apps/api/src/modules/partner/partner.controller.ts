import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
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

@Controller('partner')
@UseGuards(JwtCookieAuthGuard, RolesGuard)
@Roles('VenueOwner', 'Admin')
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: { sub: string }) {
    return this.partner.getDashboard(user.sub);
  }

  @Get('venues')
  venues(@CurrentUser() user: { sub: string }) {
    return this.partner.getVenues(user.sub);
  }

  @Post('venues')
  createVenue(@CurrentUser() user: { sub: string }, @Body() dto: CreateVenueDto) {
    return this.partner.createVenue(user.sub, dto);
  }

  @Get('pitches')
  pitches(@CurrentUser() user: { sub: string }) {
    return this.partner.getPitches(user.sub);
  }

  @Post('pitches')
  createPitch(@CurrentUser() user: { sub: string }, @Body() dto: CreatePitchDto) {
    return this.partner.createPitch(user.sub, dto);
  }

  @Patch('pitches/:id')
  updatePitch(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: UpdatePitchDto,
  ) {
    return this.partner.updatePitch(user.sub, id, dto);
  }

  @Get('earnings')
  earnings(@CurrentUser() user: { sub: string }) {
    return this.partner.getEarnings(user.sub);
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
