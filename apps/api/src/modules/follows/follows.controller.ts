import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { FollowsService } from './follows.service';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('follows')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('users')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Get('me/followers')
  @ApiOperation({ summary: 'List the authenticated user\'s followers' })
  @ApiOkResponse({ description: 'Follower users.' })
  getFollowers(@CurrentUser() user: { sub: string }) {
    return this.followsService.getFollowers(user.sub);
  }

  @Get('me/following')
  @ApiOperation({ summary: 'List users the authenticated user follows' })
  @ApiOkResponse({ description: 'Following users.' })
  getFollowing(@CurrentUser() user: { sub: string }) {
    return this.followsService.getFollowing(user.sub);
  }

  @Post(':id/follow')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Follow a user' })
  @ApiOkResponse({ description: 'Follow state and target counts.' })
  follow(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.followsService.follow(user.sub, id);
  }

  @Delete(':id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfollow a user' })
  @ApiOkResponse({ description: 'Follow state and target counts.' })
  unfollow(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.followsService.unfollow(user.sub, id);
  }
}
