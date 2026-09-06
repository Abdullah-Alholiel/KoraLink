import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MatchWaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

@ApiTags('match-waitlist')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('matches/:id/waitlist')
export class MatchWaitlistController {
  constructor(private readonly waitlist: MatchWaitlistService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join the waitlist of a full match' })
  @ApiCreatedResponse({
    description: 'Queued. Returns the 1-based FIFO position.',
    schema: {
      example: { message: 'Joined the waitlist.', position: 2 },
    },
  })
  join(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() _dto: JoinWaitlistDto,
  ) {
    return this.waitlist.join(user.sub, id).then((r) => ({
      message: 'Joined the waitlist.' as const,
      ...r,
    }));
  }

  @Delete()
  @ApiOperation({ summary: 'Leave the waitlist' })
  @ApiOkResponse({ description: 'Removed from the queue.' })
  leave(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.waitlist.leave(user.sub, id);
  }

  @Get()
  @ApiOperation({
    summary: 'Waitlist snapshot — host sees the full queue, players their own entry',
  })
  @ApiOkResponse({
    description: 'Queue snapshot with the viewer position.',
    schema: {
      example: {
        count: 3,
        yourPosition: 2,
        queue: [{ position: 2, userId: '…', fullName: '…', isYou: true }],
      },
    },
  })
  list(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.waitlist.list(id, user.sub);
  }
}
