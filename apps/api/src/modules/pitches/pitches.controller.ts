import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { MatchesService } from '../matches/matches.service';
import { PitchesService } from './pitches.service';
import { GetSlotsDto } from './dto/get-slots.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';

@ApiTags('pitches')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('pitches')
export class PitchesController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly pitchesService: PitchesService,
  ) {}

  @Get(':id/slots')
  @ApiOperation({ summary: 'Get available time slots for a pitch on a given date' })
  @ApiOkResponse({ description: 'List of time slots for the pitch.' })
  getSlots(@Param('id') id: string, @Query() dto: GetSlotsDto) {
    return this.matchesService.getPitchSlots(id, dto.date);
  }

  @Post(':id/recurring-slots')
  @ApiOperation({ summary: 'Generate recurring time slots for a pitch' })
  @ApiOkResponse({ description: 'Count of slots created and skipped.' })
  generateRecurringSlots(
    @Param('id') id: string,
    @Body() pattern: {
      days_of_week: number[];
      start_time: string;
      end_time: string;
      slot_duration_mins: number;
      weeks_ahead: number;
    },
  ) {
    return this.pitchesService.generateRecurringSlots(id, pattern);
  }
}
