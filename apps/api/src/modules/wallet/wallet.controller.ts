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
import { Throttle } from '@nestjs/throttler';

import { WalletService } from './wallet.service';
import { WalletTopupService } from './wallet.topup.service';
import { WalletHistoryDto } from './dto/wallet-history.dto';
import { TopupWalletDto } from './dto/topup-wallet.dto';
import { TopupIntentDto } from './dto/topup-intent.dto';
import { VerifyTopupDto } from './dto/verify-topup.dto';
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
    private readonly topupService: WalletTopupService,
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
  @ApiOperation({
    summary: 'Get paginated transaction history (optional from/to date range)',
  })
  @ApiOkResponse({ description: 'Paginated list of transactions.' })
  async getHistory(
    @CurrentUser() user: { sub: string },
    @Query() dto: WalletHistoryDto,
  ) {
    return this.walletService.getHistory(
      user.sub,
      dto.page,
      dto.perPage,
      dto.from,
      dto.to,
    );
  }

  // ── GET /wallet/topup/config ─────────────────────────────────
  // P0-2 (run #169): lets the PWA render the top-up entry point without
  // baking the publishable key into the client bundle (NEXT_PUBLIC_* trap) —
  // the key is served per-request to authenticated users only.
  @Get('topup/config')
  @ApiOperation({ summary: 'Top-up availability + client form config' })
  @ApiOkResponse({ description: 'Flag, publishable key (or null), amount bounds.' })
  async getTopupConfig() {
    return this.topupService.getTopupConfig();
  }

  // ── POST /wallet/topup/intent ────────────────────────────────
  // P0-2 (run #169): pins user + amount server-side BEFORE the hosted form
  // creates the payment client-side. Idempotent per (user, idempotencyKey).
  @Post('topup/intent')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Create a wallet top-up intent (Moyasar sandbox)' })
  @ApiCreatedResponse({ description: 'Intent pinned; use publishableKey with the hosted form.' })
  async createTopupIntent(
    @CurrentUser() user: { sub: string },
    @Body() dto: TopupIntentDto,
  ) {
    return this.topupService.createTopupIntent(user.sub, dto);
  }

  // ── POST /wallet/topup/verify ────────────────────────────────
  // P0-2 (run #169): the ONLY credit authority. Server fetches the payment
  // from Moyasar (sk), asserts paid + SAR + amount === intent, credits in ONE
  // tx. Throttled: this leg performs an outbound provider call per request.
  @Post('topup/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Verify a Moyasar payment and credit the wallet' })
  @ApiOkResponse({ description: 'Credit result with balance (idempotent).' })
  async verifyTopup(
    @CurrentUser() user: { sub: string },
    @Body() dto: VerifyTopupDto,
  ) {
    return this.topupService.verifyTopup(user.sub, dto);
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

  // ── POST /wallet/pay — REMOVED (run #58, reviewer-B P1) ────────────
  // This endpoint accepted a CLIENT-SUPPLIED amount for a MATCH_FEE DEBIT
  // with no server-side pricing: any authenticated user could mint ledger
  // debits disconnected from any roster/fee snapshot (the authoritative
  // join-fee path is matches.service joinMatch — chargeMatchFeeTx inside
  // the join tx at the server-derived price_per_player; refund/forfeit
  // sweeps key off fee_paid_sar, so /wallet/pay rows were invisible to the
  // money cycle). It had zero consumers (usePayWallet deleted with it) and
  // zero tests. P0-2 (real payment provider) must NOT reintroduce a
  // client-priced fee surface — fees flow through server-priced paths only.
}
