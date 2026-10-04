import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';

import { BlocksService, BlockView, UnblockResult } from './blocks.service';
import { BlockUserDto } from './dto/block-user.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// P1-53: user blocks. Two-segment `me/blocks…` paths never collide with
// UsersController's single-segment `GET /users/:id`.
@ApiTags('users')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('users')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  // ── POST /users/me/blocks ───────────────────────────────
  @Post('me/blocks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Block a user (idempotent)' })
  @ApiCreatedResponse({ description: '{ blockedId, createdAt }' })
  @ApiBadRequestResponse({ description: 'Cannot block yourself / invalid id.' })
  @ApiNotFoundResponse({ description: 'Target user not found.' })
  block(@CurrentUser() user: { sub: string }, @Body() dto: BlockUserDto): Promise<BlockView> {
    return this.blocksService.block(user.sub, dto.blockedId);
  }

  // ── GET /users/me/blocks ────────────────────────────────
  @Get('me/blocks')
  @ApiOperation({ summary: 'List users I have blocked (newest first)' })
  @ApiOkResponse({ description: '[{ blockedId, createdAt }]' })
  listBlocked(@CurrentUser() user: { sub: string }): Promise<BlockView[]> {
    return this.blocksService.listBlocked(user.sub);
  }

  // ── GET /users/me/blocks/status/:userId ─────────────────
  @Get('me/blocks/status/:userId')
  @ApiOperation({ summary: 'Whether I have blocked the given user' })
  @ApiOkResponse({ description: '{ blocked: boolean }' })
  async status(
    @CurrentUser() user: { sub: string },
    @Param('userId') userId: string,
  ): Promise<{ blocked: boolean }> {
    return { blocked: await this.blocksService.isBlockedBy(user.sub, userId) };
  }

  // ── DELETE /users/me/blocks/:blockedId ──────────────────
  @Delete('me/blocks/:blockedId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user (idempotent)' })
  @ApiOkResponse({ description: '{ blocked: false }' })
  unblock(
    @CurrentUser() user: { sub: string },
    @Param('blockedId') blockedId: string,
  ): Promise<UnblockResult> {
    return this.blocksService.unblock(user.sub, blockedId);
  }
}
