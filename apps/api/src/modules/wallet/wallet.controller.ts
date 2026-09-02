import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

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
  constructor(
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
  ) {}

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
  // P0-7 (run #26): gated by an explicit `WALLET_TOPUP_ENABLED` env flag
  // (default DISABLED). The previous `NODE_ENV === 'production'` string
  // compare was the run-#25 Strix finding (CVSS 9.1) — free SAR 10,000
  // credits were open on any Tailscale-reachable deployment running
  // NODE_ENV=development. Real payments replace this path when P0-2 ships.
  @Post('topup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Top up wallet balance' })
  @ApiCreatedResponse({ description: 'Top-up recorded successfully.' })
  async topup(
    @CurrentUser() user: { sub: string },
    @Body() dto: TopupWalletDto,
  ) {
    // Dummy self-credit path (no payment provider yet — P0-2). Kept available
    // only when the operator has explicitly opted in via WALLET_TOPUP_ENABLED.
    // Mirror dev-login gating (auth.controller.ts).
    const isEnabled =
      this.configService.get<string>('WALLET_TOPUP_ENABLED') === 'true';
    if (!isEnabled) {
      throw new ForbiddenException(
        'Wallet top-up is disabled in this environment until a payment provider is integrated',
      );
    }

    return this.walletService.recordTransaction(user.sub, {
      type: 'CREDIT',
      amount: dto.amount,
      referenceType: 'TOPUP',
      referenceId: dto.referenceId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  // ── POST /wallet/pay ─────────────────────────────────────────
  @Post('pay')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Pay for a match from wallet balance' })
  @ApiCreatedResponse({ description: 'Payment recorded successfully.' })
  async pay(
    @CurrentUser() user: { sub: string },
    @Body() dto: TopupWalletDto,
  ) {
    return this.walletService.recordTransaction(user.sub, {
      type: 'DEBIT',
      amount: dto.amount,
      referenceType: 'MATCH_FEE',
      referenceId: dto.referenceId,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
