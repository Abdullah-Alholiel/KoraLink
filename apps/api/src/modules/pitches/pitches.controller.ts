import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { MatchesService } from '../matches/matches.service';
import { GetSlotsDto } from './dto/get-slots.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';

@ApiTags('pitches')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('pitches')
export class PitchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id/slots')
  @ApiOperation({ summary: 'Get available time slots for a pitch on a given date' })
  @ApiOkResponse({ description: 'List of time slots for the pitch.' })
  getSlots(@Param('id') id: string, @Query() dto: GetSlotsDto) {
    return this.matchesService.getPitchSlots(id, dto.date);
  }
}
