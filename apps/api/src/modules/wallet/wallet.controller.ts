import {
  Controller,
  Get,
  Post,
  Query,
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
  ApiCookieAuth,
} from '@nestjs/swagger';
import { randomUUID } from 'crypto';

import { WalletService } from './wallet.service';
import { WalletHistoryDto } from './dto/wallet-history.dto';
import { TopupWalletDto } from './dto/topup-wallet.dto';
import { JwtCookieAuthGuard } from '../../common/guards/jwt-cookie-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('wallet')
@ApiCookieAuth('access_token')
@UseGuards(JwtCookieAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ── GET /wallet/balance ──────────────────────────────────────
  @Get('balance')
  @ApiOperation({ summary: 'Get authenticated user wallet balance' })
  @ApiOkResponse({ description: 'Current wallet balance in SAR.' })
  async getBalance(@CurrentUser() user: { sub: string }) {
    const balance = await this.walletService.getBalance(user.sub);
    return { balance };
  }

  // ── GET /wallet/history ──────────────────────────────────────
  @Get('history')
  @ApiOperation({ summary: 'Get paginated transaction history' })
  @ApiOkResponse({ description: 'Paginated list of transactions.' })
  async getHistory(
    @CurrentUser() user: { sub: string },
    @Query() dto: WalletHistoryDto,
  ) {
    return this.walletService.getHistory(user.sub, dto.page, dto.perPage);
  }

  // ── POST /wallet/topup ──────────────────────────────────────
  @Post('topup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Top up wallet balance' })
  @ApiCreatedResponse({ description: 'Top-up recorded successfully.' })
  async topup(
    @CurrentUser() user: { sub: string },
    @Body() dto: TopupWalletDto,
  ) {
    return this.walletService.recordTransaction(user.sub, {
      type: 'CREDIT',
      amount: dto.amount,
      referenceType: 'TOPUP',
      referenceId: dto.referenceId,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
