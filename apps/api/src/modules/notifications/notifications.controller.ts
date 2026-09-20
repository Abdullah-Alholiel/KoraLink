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
import { UnsubscribeDto } from './dto/notifications.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * P2-76 note (run #65): subscribe still uses a plain interface (below) —
 * `sub.toJSON()` can carry `expirationTime: null` (Chrome) and the global
 * pipe is forbidNonWhitelisted, so a strict SubscribeDto needs an explicit
 * allowlist decision first (board P2-76 follow-up).
 */
interface SubscribeBody {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  locale?: string;
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
      body.locale ?? 'en',
    );
  }

  /**
   * P2-76 (run #65): POST variant — the canonical unsubscribe. Some
   * proxies/clients legitimately drop DELETE request bodies, which silently
   * broke unsubscription (scoped delete matched nothing → user keeps
   * receiving pushes). POST bodies are never body-stripped. Class-DTO
   * validated (see dto/notifications.dto.ts).
   */
  @Post('unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe from push notifications (canonical)' })
  @ApiOkResponse({ description: 'Subscription removed.' })
  unsubscribe(@CurrentUser() user: { sub: string }, @Body() body: UnsubscribeDto) {
    return this.notificationsService.unsubscribe(user.sub, body.endpoint);
  }

  /**
   * DEPRECATED (P2-76, run #65): kept ONLY for already-deployed PWA bundles
   * that still send DELETE-with-body. Same DTO + same `{unsubscribed:true}`
   * response as the POST route. Sunset once no client traffic remains
   * (check push_subscriptions updated_at churn after a few releases).
   */
  @Delete('unsubscribe')
  @ApiOperation({ summary: '[DEPRECATED] Unsubscribe — use POST /notifications/unsubscribe' })
  @ApiOkResponse({ description: 'Subscription removed.' })
  unsubscribeLegacy(
    @CurrentUser() user: { sub: string },
    @Body() body: UnsubscribeDto,
  ) {
    return this.notificationsService.unsubscribe(user.sub, body.endpoint);
  }
}
