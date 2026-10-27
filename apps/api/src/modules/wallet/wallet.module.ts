import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletTopupService } from './wallet.topup.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [WalletService, WalletTopupService],
  exports: [WalletService, WalletTopupService],
})
export class WalletModule {}
