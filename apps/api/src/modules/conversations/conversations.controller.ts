import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('conversations')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Find or create a 1:1 conversation with a user' })
  @ApiCreatedResponse({ description: 'The conversation.' })
  create(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.findOrCreateDirect(user.sub, dto.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user\'s conversations' })
  @ApiOkResponse({ description: 'Conversations with last message + unread.' })
  list(@CurrentUser() user: { sub: string }) {
    return this.conversationsService.listForUser(user.sub);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get conversation message history' })
  @ApiOkResponse({ description: 'Messages (chronological).' })
  listMessages(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.conversationsService.listMessages(
      user.sub,
      id,
      page ? parseInt(page, 10) : 1,
      perPage ? parseInt(perPage, 10) : 30,
    );
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message (REST fallback; WS is primary)' })
  @ApiCreatedResponse({ description: 'The created message with sender.' })
  sendMessage(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(user.sub, id, dto.content, dto.clientMessageId);
  }
}
