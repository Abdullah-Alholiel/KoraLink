import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MarkReadDto } from './dto/mark-read.dto';

@ApiTags('feed')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('users/me')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get('feed')
  @ApiOperation({ summary: 'Get the activity feed, most relevant first' })
  @ApiOkResponse({ description: 'Relevance-sorted feed items.' })
  getFeed(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.activitiesService.getFeed(
      user.sub,
      page ? parseInt(page, 10) : 1,
      perPage ? parseInt(perPage, 10) : 20,
    );
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get notifications directed at the user' })
  @ApiOkResponse({ description: 'Directed notification items.' })
  getNotifications(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.activitiesService.getNotifications(
      user.sub,
      page ? parseInt(page, 10) : 1,
      perPage ? parseInt(perPage, 10) : 20,
    );
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Unread directed-notification count (bell badge)' })
  @ApiOkResponse({ description: '{ unreadCount: number }' })
  async getUnreadCount(@CurrentUser() user: { sub: string }) {
    const unreadCount = await this.activitiesService.getUnreadNotificationCount(user.sub);
    return { unreadCount };
  }

  @Post('notifications/read')
  @ApiOperation({ summary: 'Mark notifications as read' })
  @ApiOkResponse({ description: 'Number of items marked read.' })
  markRead(
    @CurrentUser() user: { sub: string },
    @Body() dto: MarkReadDto,
  ) {
    return this.activitiesService.markRead(
      user.sub,
      dto.all ? undefined : dto.ids,
    );
  }
}
