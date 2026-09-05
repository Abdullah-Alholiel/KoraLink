import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { MatchesScheduler } from './matches.scheduler';
import { WalletModule } from '../wallet/wallet.module';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesModule } from '../activities/activities.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [WalletModule, GatewayModule, NotificationsModule, ActivitiesModule, MailerModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchesScheduler],
  exports: [MatchesService],
})
export class MatchesModule implements OnModuleInit {
  private readonly logger = new Logger(MatchesModule.name);

  constructor(private readonly matchesService: MatchesService) {}

  async onModuleInit() {
    try {
      const count = await this.matchesService.autoCompletePastMatches();
      if (count > 0) {
        this.logger.log(`Auto-completed ${count} past matches → Completed`);
      }
    } catch (err) {
      // Transient DB connection resets (e.g. ECONNRESET during a deploy/restart)
      // must not fail boot or surface as an unhandled rejection (Sentry noise).
      // The 5-min scheduler tick retries; log and continue booting.
      this.logger.error(
        `autoCompletePastMatches at init failed (will retry via scheduler): ${
          (err as Error).message
        }`,
      );
    }
  }
}
