import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletTopupService } from './wallet.topup.service';
import { WalletReceiptService } from './wallet.receipt.service';
import { WalletReconcileService } from './wallet.reconcile.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [WalletService, WalletTopupService, WalletReceiptService, WalletReconcileService],
  exports: [WalletService, WalletTopupService],
})
export class WalletModule {}
