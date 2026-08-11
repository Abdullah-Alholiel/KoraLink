import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Request } from 'express';

import { NotificationsService } from './notifications.service';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface SubscribeBody {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

@ApiTags('notifications')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to push notifications' })
  @ApiOkResponse({ description: 'Subscription stored.' })
  subscribe(
    @CurrentUser() user: { sub: string },
    @Body() body: SubscribeBody,
    @Req() req: Request,
  ) {
    return this.notificationsService.subscribe(
      user.sub,
      body,
      req.headers['user-agent'],
    );
  }

  @Delete('unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe from push notifications' })
  @ApiOkResponse({ description: 'Subscription removed.' })
  unsubscribe(
    @CurrentUser() user: { sub: string },
    @Body() body: { endpoint: string },
  ) {
    return this.notificationsService.unsubscribe(user.sub, body.endpoint);
  }
}
