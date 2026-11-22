import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletTopupService } from './wallet.topup.service';
import { WalletReceiptService } from './wallet.receipt.service';
import { WalletReconcileService } from './wallet.reconcile.service';
import { WalletController } from './wallet.controller';
import { WalletWebhookController } from './wallet.webhook.controller';

@Module({
  controllers: [WalletController, WalletWebhookController],
  providers: [WalletService, WalletTopupService, WalletReceiptService, WalletReconcileService],
  exports: [WalletService, WalletTopupService],
})
export class WalletModule {}
